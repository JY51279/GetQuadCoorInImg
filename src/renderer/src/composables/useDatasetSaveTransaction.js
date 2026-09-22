import { rollbackDatasetMutation } from '../state/DatasetState.js';
import { normalizeJsonSaveResult } from '../../../shared/JsonSaveResult.js';
import { SERVICE_ERROR_KIND } from '../../../shared/ServiceResult.js';
import { USER_MESSAGES, toUserErrorMessage } from '../../../shared/UserMessages.js';
import {
  WORKFLOW_OPERATION,
  WORKFLOW_PHASE,
  canApplySaveResult,
  completeOperation,
  isCurrentOperation,
  startSave,
} from '../state/WorkflowState.js';

export const SAVE_TRANSACTION_STATUS = Object.freeze({
  SAVED: 'saved',
  UNCHANGED: 'unchanged',
  START_FAILED: 'start-failed',
  MUTATION_FAILED: 'mutation-failed',
  SAVE_FAILED: 'save-failed',
  STALE: 'stale',
  COMPLETION_FAILED: 'completion-failed',
});

// Publish mutation details only after a successful transaction (or a no-op).
// Failed/stale saves must never expose a success-history payload to the caller.
function createResult(
  status,
  { error = '', errorKind = '', backupPath = '', rollbackFailed = false, changed = false, mutation = null } = {},
) {
  const success = status === SAVE_TRANSACTION_STATUS.SAVED || status === SAVE_TRANSACTION_STATUS.UNCHANGED;
  return { success, status, error, errorKind, backupPath, rollbackFailed, changed, mutation };
}

/**
 * saveJsonFile resolves to { success, backupPath?, error?, errorKind? }, never a boolean.
 * Started persistence and receipt rollback outlive the view; callers gate UI/history updates.
 */
export function useDatasetSaveTransaction({
  workflowState,
  getCurrentImageIndex,
  saveJsonFile,
  rollbackMutation = rollbackDatasetMutation,
} = {}) {
  function applyWorkflowTransition(result) {
    if (!result.success) return false;
    workflowState.value = result.state;
    return true;
  }

  async function run(mutate) {
    const sourceImageIndex = getCurrentImageIndex();
    const started = startSave(workflowState.value, { sourceImageIndex });
    if (!applyWorkflowTransition(started)) {
      return createResult(SAVE_TRANSACTION_STATUS.START_FAILED, { error: started.error });
    }

    const operationId = started.operationId;
    let completionPhase = null;
    let operationCompleted = false;
    let rollbackFailed = false;

    function finishOperation() {
      if (operationCompleted) return true;
      operationCompleted = applyWorkflowTransition(
        completeOperation(workflowState.value, operationId, completionPhase),
      );
      return operationCompleted;
    }

    function restoreMutationState(receipt) {
      try {
        const rollbackResult = rollbackMutation(receipt);
        if (rollbackResult === true || rollbackResult?.success === true) return true;
      } catch (error) {
        console.error('Failed to roll back dataset mutation:', error);
      }
      rollbackFailed = true;
      completionPhase = WORKFLOW_PHASE.RECOVERY_REQUIRED;
      return false;
    }

    try {
      let mutationResult;
      try {
        mutationResult = mutate();
      } catch (error) {
        console.error('Dataset mutation threw before returning a receipt:', error);
        rollbackFailed = true;
        completionPhase = WORKFLOW_PHASE.RECOVERY_REQUIRED;
        return createResult(SAVE_TRANSACTION_STATUS.MUTATION_FAILED, {
          error: toUserErrorMessage(error, 'JSON 操作失败。'),
          rollbackFailed,
        });
      }
      if (!mutationResult || mutationResult.success !== true) {
        rollbackFailed = mutationResult?.rollbackFailed === true;
        if (rollbackFailed) completionPhase = WORKFLOW_PHASE.RECOVERY_REQUIRED;
        return createResult(SAVE_TRANSACTION_STATUS.MUTATION_FAILED, {
          error: mutationResult?.error || 'JSON 操作失败。',
          rollbackFailed,
        });
      }
      if (typeof mutationResult.changed !== 'boolean') {
        rollbackFailed = true;
        completionPhase = WORKFLOW_PHASE.RECOVERY_REQUIRED;
        return createResult(SAVE_TRANSACTION_STATUS.MUTATION_FAILED, {
          error: 'JSON 操作返回了无效的变更结果。',
          rollbackFailed,
        });
      }
      if (!mutationResult.changed) {
        if (!finishOperation()) return createResult(SAVE_TRANSACTION_STATUS.COMPLETION_FAILED);
        return createResult(SAVE_TRANSACTION_STATUS.UNCHANGED, { mutation: mutationResult });
      }
      if (!mutationResult.receipt) {
        rollbackFailed = true;
        completionPhase = WORKFLOW_PHASE.RECOVERY_REQUIRED;
        return createResult(SAVE_TRANSACTION_STATUS.MUTATION_FAILED, {
          error: 'JSON 操作修改了数据，但没有返回可用于回滚的变更记录。',
          rollbackFailed,
        });
      }

      let saved;
      try {
        saved = normalizeJsonSaveResult(await saveJsonFile());
      } catch (error) {
        console.error('Dataset persistence callback rejected:', error);
        if (!canApplySaveResult(workflowState.value, operationId, getCurrentImageIndex())) {
          return createResult(SAVE_TRANSACTION_STATUS.STALE, {
            error: '图集或图片已切换，已忽略过期的保存失败结果。',
            changed: true,
          });
        }
        restoreMutationState(mutationResult.receipt);
        return createResult(SAVE_TRANSACTION_STATUS.SAVE_FAILED, {
          error: toUserErrorMessage(error, USER_MESSAGES.JSON_SAVE_FAILED),
          errorKind: SERVICE_ERROR_KIND.TRANSPORT,
          rollbackFailed,
          changed: true,
        });
      }
      if (!canApplySaveResult(workflowState.value, operationId, getCurrentImageIndex())) {
        return createResult(SAVE_TRANSACTION_STATUS.STALE, {
          error: '图集或图片已切换，已忽略过期的保存结果。',
          changed: true,
        });
      }
      if (!saved.success) {
        restoreMutationState(mutationResult.receipt);
        return createResult(SAVE_TRANSACTION_STATUS.SAVE_FAILED, {
          error: saved.error,
          errorKind: saved.errorKind,
          backupPath: saved.backupPath,
          rollbackFailed,
          changed: true,
        });
      }
      if (!finishOperation()) {
        return createResult(SAVE_TRANSACTION_STATUS.COMPLETION_FAILED, { changed: true });
      }
      return createResult(SAVE_TRANSACTION_STATUS.SAVED, {
        changed: true,
        mutation: mutationResult,
        backupPath: saved.backupPath,
      });
    } finally {
      if (isCurrentOperation(workflowState.value, operationId, WORKFLOW_OPERATION.SAVE)) finishOperation();
    }
  }

  return { run };
}

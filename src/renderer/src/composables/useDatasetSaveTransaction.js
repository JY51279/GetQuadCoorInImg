import { rollbackDatasetMutation } from '../state/DatasetState.js';
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

function createResult(status, { error = '', rollbackFailed = false, changed = false } = {}) {
  const success = status === SAVE_TRANSACTION_STATUS.SAVED || status === SAVE_TRANSACTION_STATUS.UNCHANGED;
  return { success, status, error, rollbackFailed, changed };
}

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
      } catch {
        // A failed rollback is reported through the structured transaction result.
      }
      rollbackFailed = true;
      completionPhase = WORKFLOW_PHASE.DATASET_READY;
      return false;
    }

    try {
      let mutationResult;
      try {
        mutationResult = mutate();
      } catch (error) {
        rollbackFailed = true;
        completionPhase = WORKFLOW_PHASE.DATASET_READY;
        return createResult(SAVE_TRANSACTION_STATUS.MUTATION_FAILED, {
          error: `JSON operation failed: ${error.message}`,
          rollbackFailed,
        });
      }
      if (!mutationResult || mutationResult.success !== true) {
        rollbackFailed = mutationResult?.rollbackFailed === true;
        if (rollbackFailed) completionPhase = WORKFLOW_PHASE.DATASET_READY;
        return createResult(SAVE_TRANSACTION_STATUS.MUTATION_FAILED, {
          error: mutationResult?.error || 'JSON operation failed.',
          rollbackFailed,
        });
      }
      if (typeof mutationResult.changed !== 'boolean') {
        rollbackFailed = true;
        completionPhase = WORKFLOW_PHASE.DATASET_READY;
        return createResult(SAVE_TRANSACTION_STATUS.MUTATION_FAILED, {
          error: 'JSON operation returned an invalid mutation result.',
          rollbackFailed,
        });
      }
      if (!mutationResult.changed) {
        if (!finishOperation()) return createResult(SAVE_TRANSACTION_STATUS.COMPLETION_FAILED);
        return createResult(SAVE_TRANSACTION_STATUS.UNCHANGED);
      }
      if (!mutationResult.receipt) {
        rollbackFailed = true;
        completionPhase = WORKFLOW_PHASE.DATASET_READY;
        return createResult(SAVE_TRANSACTION_STATUS.MUTATION_FAILED, {
          error: 'JSON operation changed data without returning a rollback receipt.',
          rollbackFailed,
        });
      }

      let saved;
      try {
        saved = await saveJsonFile();
      } catch (error) {
        if (!canApplySaveResult(workflowState.value, operationId, getCurrentImageIndex())) {
          return createResult(SAVE_TRANSACTION_STATUS.STALE, {
            error: 'Ignored a stale save failure because the dataset or image context changed.',
            changed: true,
          });
        }
        restoreMutationState(mutationResult.receipt);
        return createResult(SAVE_TRANSACTION_STATUS.SAVE_FAILED, {
          error: `Failed to save JSON: ${error.message}`,
          rollbackFailed,
          changed: true,
        });
      }
      if (!canApplySaveResult(workflowState.value, operationId, getCurrentImageIndex())) {
        return createResult(SAVE_TRANSACTION_STATUS.STALE, {
          error: 'Ignored a stale save result because the dataset or image context changed.',
          changed: true,
        });
      }
      if (!saved) {
        restoreMutationState(mutationResult.receipt);
        return createResult(SAVE_TRANSACTION_STATUS.SAVE_FAILED, { rollbackFailed, changed: true });
      }
      if (!finishOperation()) {
        return createResult(SAVE_TRANSACTION_STATUS.COMPLETION_FAILED, { changed: true });
      }
      return createResult(SAVE_TRANSACTION_STATUS.SAVED, { changed: true });
    } finally {
      if (isCurrentOperation(workflowState.value, operationId, WORKFLOW_OPERATION.SAVE)) finishOperation();
    }
  }

  return { run };
}

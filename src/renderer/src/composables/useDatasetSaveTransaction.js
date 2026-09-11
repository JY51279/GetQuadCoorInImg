import { createDatasetMutationSnapshot, restoreDatasetMutationSnapshot } from '../state/DatasetState.js';
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
  START_FAILED: 'start-failed',
  MUTATION_FAILED: 'mutation-failed',
  SAVE_FAILED: 'save-failed',
  STALE: 'stale',
  COMPLETION_FAILED: 'completion-failed',
});

function createResult(status, { error = '', rollbackFailed = false } = {}) {
  return { success: status === SAVE_TRANSACTION_STATUS.SAVED, status, error, rollbackFailed };
}

export function useDatasetSaveTransaction({
  workflowState,
  getCurrentImageIndex,
  saveJsonFile,
  createSnapshot = createDatasetMutationSnapshot,
  restoreSnapshot = restoreDatasetMutationSnapshot,
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
    let datasetSnapshot;
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

    function restoreMutationState() {
      try {
        if (restoreSnapshot(datasetSnapshot)) return true;
      } catch {
        // A failed restore is reported through the structured transaction result.
      }
      rollbackFailed = true;
      completionPhase = WORKFLOW_PHASE.DATASET_READY;
      return false;
    }

    try {
      try {
        datasetSnapshot = createSnapshot();
      } catch (error) {
        return createResult(SAVE_TRANSACTION_STATUS.MUTATION_FAILED, {
          error: `JSON operation failed: ${error.message}`,
        });
      }

      let mutationError;
      try {
        mutationError = mutate();
      } catch (error) {
        restoreMutationState();
        return createResult(SAVE_TRANSACTION_STATUS.MUTATION_FAILED, {
          error: `JSON operation failed: ${error.message}`,
          rollbackFailed,
        });
      }
      if (mutationError !== null) {
        restoreMutationState();
        return createResult(SAVE_TRANSACTION_STATUS.MUTATION_FAILED, {
          error: mutationError,
          rollbackFailed,
        });
      }

      const saved = await saveJsonFile();
      if (!canApplySaveResult(workflowState.value, operationId, getCurrentImageIndex())) {
        return createResult(SAVE_TRANSACTION_STATUS.STALE, {
          error: 'Ignored a stale save result because the dataset or image context changed.',
        });
      }
      if (!saved) {
        restoreMutationState();
        return createResult(SAVE_TRANSACTION_STATUS.SAVE_FAILED, { rollbackFailed });
      }
      if (!finishOperation()) return createResult(SAVE_TRANSACTION_STATUS.COMPLETION_FAILED);
      return createResult(SAVE_TRANSACTION_STATUS.SAVED);
    } finally {
      if (isCurrentOperation(workflowState.value, operationId, WORKFLOW_OPERATION.SAVE)) finishOperation();
    }
  }

  return { run };
}

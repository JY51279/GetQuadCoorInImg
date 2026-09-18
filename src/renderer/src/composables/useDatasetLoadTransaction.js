import { DATASET_LOAD_STATUS, normalizeDatasetTarget, prepareDatasetLoad } from '../services/DatasetLoadService.js';
import { clearDatasetProcess, commitPreparedJsonProcess } from '../state/DatasetState.js';
import {
  WORKFLOW_OPERATION,
  commitDataset,
  failOperation,
  isCurrentOperation,
  rejectDataset,
  selectDatasetTarget,
  startDatasetLoad,
} from '../state/WorkflowState.js';
import { USER_MESSAGES, toUserErrorMessage } from '../../../shared/UserMessages.js';

export const DATASET_LOAD_TRANSACTION_STATUS = Object.freeze({
  READY: DATASET_LOAD_STATUS.READY,
  CANCELED: DATASET_LOAD_STATUS.CANCELED,
  FAILED: DATASET_LOAD_STATUS.FAILED,
  STALE: DATASET_LOAD_STATUS.STALE,
  START_FAILED: 'start-failed',
});

function createResult(status, { target = null, preparedJson = null, error = '' } = {}) {
  return {
    success: status === DATASET_LOAD_TRANSACTION_STATUS.READY,
    status,
    target,
    preparedJson,
    error,
  };
}

export function useDatasetLoadTransaction({
  workflowState,
  resolveImagePaths,
  saveJsonFile,
  confirmLossyRepair = () => false,
  onDatasetTargetSelected = () => {},
  prepareLoad = prepareDatasetLoad,
  clearDataset = clearDatasetProcess,
  commitPreparedDataset = commitPreparedJsonProcess,
} = {}) {
  function applyWorkflowTransition(result) {
    if (!result.success) return false;
    workflowState.value = result.state;
    return true;
  }

  function isCurrent(operationId) {
    return isCurrentOperation(workflowState.value, operationId, WORKFLOW_OPERATION.LOAD_DATASET);
  }

  function closeFailedOperation(operationId, target) {
    if (!isCurrent(operationId)) return false;
    const transition = target
      ? rejectDataset(workflowState.value, operationId)
      : failOperation(workflowState.value, operationId);
    return applyWorkflowTransition(transition);
  }

  function failedOrStale(operationId, target, error) {
    if (!closeFailedOperation(operationId, target)) {
      return createResult(DATASET_LOAD_TRANSACTION_STATUS.STALE, { target });
    }
    return createResult(DATASET_LOAD_TRANSACTION_STATUS.FAILED, { target, error });
  }

  async function run(requestDataset, { fallbackMessage = USER_MESSAGES.JSON_READ_FAILED } = {}) {
    if (typeof requestDataset !== 'function') {
      return createResult(DATASET_LOAD_TRANSACTION_STATUS.START_FAILED, {
        error: '图集加载请求无效。',
      });
    }

    const started = startDatasetLoad(workflowState.value);
    if (!applyWorkflowTransition(started)) {
      return createResult(DATASET_LOAD_TRANSACTION_STATUS.START_FAILED, { error: started.error });
    }
    const operationId = started.operationId;

    let response;
    try {
      response = await requestDataset(operationId);
    } catch (error) {
      return failedOrStale(operationId, null, toUserErrorMessage(error, fallbackMessage));
    }

    if (!isCurrent(operationId)) {
      return createResult(DATASET_LOAD_TRANSACTION_STATUS.STALE);
    }
    if (!response || typeof response !== 'object') {
      return failedOrStale(operationId, null, fallbackMessage);
    }

    const responseOperationId = response.requestId ?? operationId;
    if (responseOperationId !== operationId) {
      return failedOrStale(operationId, null, '图集文件响应与当前加载操作不匹配。');
    }
    const normalizedResponse = response.requestId == null ? { ...response, requestId: operationId } : response;
    const target = normalizeDatasetTarget(normalizedResponse.target);

    if (target) {
      const selected = selectDatasetTarget(workflowState.value, operationId, target);
      if (!applyWorkflowTransition(selected)) {
        return failedOrStale(operationId, null, selected.error);
      }
      try {
        clearDataset();
        onDatasetTargetSelected(target);
      } catch (error) {
        return failedOrStale(operationId, target, toUserErrorMessage(error, '切换到新的图集工作区失败。'));
      }
    }

    let loadResult;
    try {
      loadResult = await prepareLoad(normalizedResponse, {
        confirmLossyRepair,
        resolveImagePaths,
        saveJsonFile,
        isCurrent: () => isCurrent(operationId),
      });
    } catch (error) {
      return failedOrStale(operationId, target, toUserErrorMessage(error, '处理 JSON 文件失败。'));
    }

    if (!isCurrent(operationId)) {
      return createResult(DATASET_LOAD_TRANSACTION_STATUS.STALE, { target });
    }
    if (!loadResult || typeof loadResult !== 'object') {
      return failedOrStale(operationId, target, '图集加载结果无效。');
    }
    if (loadResult.status === DATASET_LOAD_STATUS.STALE) {
      return failedOrStale(operationId, target, '图集加载结果已失效。');
    }
    if (loadResult.status !== DATASET_LOAD_STATUS.READY) {
      if (!closeFailedOperation(operationId, target)) {
        return createResult(DATASET_LOAD_TRANSACTION_STATUS.STALE, { target });
      }
      return createResult(
        loadResult.status === DATASET_LOAD_STATUS.CANCELED
          ? DATASET_LOAD_TRANSACTION_STATUS.CANCELED
          : DATASET_LOAD_TRANSACTION_STATUS.FAILED,
        {
          target,
          error: loadResult.error || '',
        },
      );
    }

    if (!target) {
      return failedOrStale(operationId, null, '图集加载结果缺少文件目标。');
    }
    if (!isCurrent(operationId)) {
      return createResult(DATASET_LOAD_TRANSACTION_STATUS.STALE, { target });
    }
    try {
      if (!commitPreparedDataset(loadResult.preparedJson)) {
        return failedOrStale(operationId, target, '加载 JSON 失败：无法提交处理后的数据集。');
      }
    } catch (error) {
      return failedOrStale(operationId, target, toUserErrorMessage(error, '加载 JSON 失败：无法提交处理后的数据集。'));
    }

    const committed = commitDataset(workflowState.value, operationId);
    if (!applyWorkflowTransition(committed)) {
      return failedOrStale(operationId, target, committed.error);
    }
    return createResult(DATASET_LOAD_TRANSACTION_STATUS.READY, {
      target,
      preparedJson: loadResult.preparedJson,
    });
  }

  return { run };
}

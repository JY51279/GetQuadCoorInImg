import { DATASET_LOAD_STATUS, normalizeDatasetTarget, prepareDatasetLoad } from '../services/DatasetLoadService.js';
import { clearDatasetProcess, commitPreparedJsonProcess } from '../state/DatasetState.js';
import { getDatasetResponseError } from '../../../shared/DatasetFileResponse.js';
import { SERVICE_ERROR_KIND } from '../../../shared/ServiceResult.js';
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

function createResult(
  status,
  { target = null, preparedJson = null, error = '', errorKind = '', backupPath = '' } = {},
) {
  return {
    success: status === DATASET_LOAD_TRANSACTION_STATUS.READY,
    status,
    target,
    preparedJson,
    error,
    errorKind,
    backupPath,
  };
}

/** requestDataset must echo its operation id. Only genuinely superseded invocations are stale. */
export function useDatasetLoadTransaction({
  workflowState,
  resolveImagePaths,
  saveJsonFile,
  confirmLossyRepair = () => false,
  onDatasetTargetSelected = () => {},
  prepareLoad = prepareDatasetLoad,
  clearDataset = clearDatasetProcess,
  commitPreparedDataset = commitPreparedJsonProcess,
  isActive = () => true,
} = {}) {
  function applyWorkflowTransition(result) {
    if (!result.success) return false;
    workflowState.value = result.state;
    return true;
  }

  function isCurrent(operationId) {
    return isActive() && isCurrentOperation(workflowState.value, operationId, WORKFLOW_OPERATION.LOAD_DATASET);
  }

  function closeFailedOperation(operationId, target) {
    if (!isCurrent(operationId)) return false;
    const transition = target
      ? rejectDataset(workflowState.value, operationId)
      : failOperation(workflowState.value, operationId);
    return applyWorkflowTransition(transition);
  }

  function failedOrStale(operationId, target, error, details = {}) {
    if (!closeFailedOperation(operationId, target)) {
      return createResult(DATASET_LOAD_TRANSACTION_STATUS.STALE, { target });
    }
    return createResult(DATASET_LOAD_TRANSACTION_STATUS.FAILED, { ...details, target, error });
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
      console.error('Dataset request failed:', error);
      return failedOrStale(operationId, null, toUserErrorMessage(error, fallbackMessage), {
        errorKind: SERVICE_ERROR_KIND.TRANSPORT,
      });
    }

    if (!isCurrent(operationId)) {
      return createResult(DATASET_LOAD_TRANSACTION_STATUS.STALE);
    }
    const protocolError = getDatasetResponseError(response, operationId);
    if (protocolError) {
      console.error('Invalid dataset response:', response);
      return failedOrStale(operationId, null, protocolError, { errorKind: SERVICE_ERROR_KIND.INVALID_RESPONSE });
    }
    const target = normalizeDatasetTarget(response.target);

    if (target) {
      const selected = selectDatasetTarget(workflowState.value, operationId, target);
      if (!applyWorkflowTransition(selected)) {
        return failedOrStale(operationId, null, selected.error);
      }
      try {
        clearDataset();
        onDatasetTargetSelected(target);
      } catch (error) {
        console.error('Failed to select dataset workspace:', error);
        return failedOrStale(operationId, target, toUserErrorMessage(error, '切换到新的图集工作区失败。'));
      }
    }

    let loadResult;
    try {
      loadResult = await prepareLoad(response, {
        confirmLossyRepair,
        resolveImagePaths,
        saveJsonFile,
        isCurrent: () => isCurrent(operationId),
      });
    } catch (error) {
      console.error('Dataset preparation callback rejected:', error);
      return failedOrStale(operationId, target, toUserErrorMessage(error, '处理 JSON 文件失败。'));
    }

    if (!isCurrent(operationId)) {
      return createResult(DATASET_LOAD_TRANSACTION_STATUS.STALE, { target });
    }
    if (!loadResult || !Object.values(DATASET_LOAD_STATUS).includes(loadResult.status)) {
      console.error('Invalid dataset preparation result:', loadResult);
      return failedOrStale(operationId, target, '图集加载结果无效。', {
        errorKind: SERVICE_ERROR_KIND.INVALID_RESPONSE,
      });
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
          errorKind: loadResult.errorKind || '',
          backupPath: loadResult.backupPath || '',
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
        return failedOrStale(operationId, target, '加载 JSON 失败：无法提交处理后的数据集。', {
          backupPath: loadResult.backupPath,
        });
      }
    } catch (error) {
      console.error('Failed to commit prepared dataset:', error);
      return failedOrStale(operationId, target, toUserErrorMessage(error, '加载 JSON 失败：无法提交处理后的数据集。'), {
        backupPath: loadResult.backupPath,
      });
    }

    const committed = commitDataset(workflowState.value, operationId);
    if (!applyWorkflowTransition(committed)) {
      return failedOrStale(operationId, target, committed.error);
    }
    return createResult(DATASET_LOAD_TRANSACTION_STATUS.READY, {
      target,
      preparedJson: loadResult.preparedJson,
      backupPath: loadResult.backupPath || '',
    });
  }

  return { run };
}

import { isFilePath, isRecord, isRequestId } from './ServiceResult.js';

export const DATASET_FILE_STATUS = Object.freeze({
  READY: 'ready',
  FAILED: 'failed',
  CANCELED: 'canceled',
});

export function createDatasetTarget(filePath, fileName = '') {
  if (!isFilePath(filePath)) return null;
  const fallbackFileName = filePath.split(/[\\/]/).at(-1) || '';
  return {
    path: filePath,
    fileName: typeof fileName === 'string' && fileName.length > 0 ? fileName : fallbackFileName,
  };
}

export function createCanceledDatasetFileResponse(requestId) {
  return {
    requestId,
    status: DATASET_FILE_STATUS.CANCELED,
    target: null,
    jsonInfo: null,
    error: '',
  };
}

// Validate the invocation envelope before selecting a target. JSON content is validated by preparation.
export function getDatasetResponseError(response, requestId) {
  if (!isRecord(response) || !isRequestId(response.requestId) || response.requestId !== requestId) {
    return '图集文件响应与当前加载操作不匹配。';
  }
  if (!Object.values(DATASET_FILE_STATUS).includes(response.status)) return '图集文件响应状态无效。';
  if (response.target != null && (!isRecord(response.target) || !isFilePath(response.target.path))) {
    return '图集文件响应的目标路径无效。';
  }
  if (response.status === DATASET_FILE_STATUS.CANCELED && response.target != null) {
    return '取消选择的图集响应不能包含新目标。';
  }
  return '';
}

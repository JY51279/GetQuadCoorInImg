import { normalizeCoordinateScale } from '../utils/AnnotationCoordinates.js';
import { loadRendererImage } from '../utils/RendererImageLoader.js';
import { USER_MESSAGES, toUserErrorMessage } from '../../../shared/UserMessages.js';
import { isFilePath, isRecord, normalizeServiceErrorKind, SERVICE_ERROR_KIND } from '../../../shared/ServiceResult.js';

export const IMAGE_REQUEST_SOURCE = Object.freeze({
  MANUAL: 'manual',
  DATASET: 'dataset',
});

export const IMAGE_REQUEST_STATUS = Object.freeze({
  READY: 'ready',
  CANCELED: 'canceled',
  FAILED: 'failed',
  STALE: 'stale',
});

export const IMAGE_FAILURE_ACTION = Object.freeze({
  RETRY: 'retry',
  RESTORE: 'restore',
  CLEAR: 'clear',
});

function normalizePath(path) {
  return typeof path === 'string' ? path.replace(/[\\/]/g, '/') : '';
}

export function createImageRequestService({
  invoke,
  loadImage = loadRendererImage,
  getAdjacentTarget = () => ({ success: false }),
} = {}) {
  let activeRequest = null;
  let nextRequestId = 0;

  function getActiveRequest() {
    return activeRequest;
  }

  function beginManualRequest(operationId) {
    activeRequest = {
      requestId: ++nextRequestId,
      operationId,
      source: IMAGE_REQUEST_SOURCE.MANUAL,
      targetImageIndex: null,
      path: '',
      direction: '',
      attemptedIndexes: new Set(),
    };
    return activeRequest;
  }

  function beginDatasetRequest({ operationId, target, direction, currentImageIndex = -1, previousRequest = null }) {
    const attemptedIndexes = new Set(previousRequest?.attemptedIndexes ?? []);
    if (previousRequest === null && currentImageIndex >= 0) attemptedIndexes.add(currentImageIndex);
    attemptedIndexes.add(target.index);

    activeRequest = {
      requestId: ++nextRequestId,
      operationId: previousRequest?.operationId ?? operationId,
      source: IMAGE_REQUEST_SOURCE.DATASET,
      targetImageIndex: target.index,
      path: target.path,
      direction,
      attemptedIndexes,
    };
    return activeRequest;
  }

  function clear(requestId = null) {
    if (requestId !== null && activeRequest?.requestId !== requestId) return false;
    activeRequest = null;
    return true;
  }

  function isCurrentRequest(requestId, isOperationCurrent) {
    return Boolean(
      activeRequest && activeRequest.requestId === requestId && isOperationCurrent(activeRequest.operationId),
    );
  }

  function stale() {
    return { status: IMAGE_REQUEST_STATUS.STALE };
  }

  function failed(request, error, path = '', errorKind = SERVICE_ERROR_KIND.OPERATION) {
    return {
      status: IMAGE_REQUEST_STATUS.FAILED,
      request,
      error: toUserErrorMessage(error, USER_MESSAGES.UNKNOWN_IMAGE_LOADING_ERROR),
      path: normalizePath(path || request?.path),
      errorKind,
    };
  }

  async function handleResponse(response, { isOperationCurrent = () => true } = {}) {
    if (!isCurrentRequest(response?.requestId, isOperationCurrent)) return stale();
    const request = activeRequest;

    if (response.canceled === true && (response.success === false || response.success === undefined)) {
      return { status: IMAGE_REQUEST_STATUS.CANCELED, request };
    }
    if (typeof response.success !== 'boolean' || (response.canceled !== undefined && response.canceled !== false)) {
      return failed(request, '图片加载响应格式无效。', '', SERVICE_ERROR_KIND.INVALID_RESPONSE);
    }
    if (response.success !== true) {
      return failed(request, response.error, response.path, normalizeServiceErrorKind(response.errorKind));
    }

    const imageInfo = response.imageInfo;
    try {
      const coordinateScale = normalizeCoordinateScale({
        x: imageInfo?.coordinateScaleX,
        y: imageInfo?.coordinateScaleY,
      });
      if (coordinateScale === null) {
        return failed(
          request,
          '处理后的图片坐标缩放比例必须包含两个有限正数。',
          '',
          SERVICE_ERROR_KIND.INVALID_RESPONSE,
        );
      }
      if (
        !isRecord(imageInfo) ||
        !isFilePath(imageInfo.path) ||
        !isFilePath(imageInfo.url) ||
        ![imageInfo.originalWidth, imageInfo.originalHeight, imageInfo.displayWidth, imageInfo.displayHeight].every(
          value => Number.isSafeInteger(value) && value > 0,
        )
      ) {
        return failed(request, '图片加载响应缺少有效的路径或尺寸。', '', SERVICE_ERROR_KIND.INVALID_RESPONSE);
      }

      const image = await loadImage(imageInfo.url);
      if (!isCurrentRequest(request.requestId, isOperationCurrent)) return stale();
      if (image?.naturalWidth !== imageInfo.displayWidth || image?.naturalHeight !== imageInfo.displayHeight) {
        throw new Error('处理后的图片尺寸与实际加载尺寸不一致。');
      }

      return {
        status: IMAGE_REQUEST_STATUS.READY,
        request,
        image,
        imageInfo: { ...imageInfo, path: normalizePath(imageInfo.path) },
        coordinateScale,
      };
    } catch (error) {
      if (!isCurrentRequest(request.requestId, isOperationCurrent)) return stale();
      console.error('Failed to decode prepared image:', error);
      return failed(request, error, imageInfo?.path);
    }
  }

  async function execute(channel, payload, { isOperationCurrent = () => true } = {}) {
    const requestId = payload?.requestId;
    if (!isCurrentRequest(requestId, isOperationCurrent)) return stale();
    const request = activeRequest;
    try {
      const response = await invoke(channel, payload);
      // The invocation owns the response, not a request id supplied by that response.
      if (!isCurrentRequest(requestId, isOperationCurrent)) return stale();
      if (response?.requestId !== requestId) {
        return failed(request, '图片加载响应缺少有效的请求标识。', '', SERVICE_ERROR_KIND.INVALID_RESPONSE);
      }
      return await handleResponse(response, { isOperationCurrent });
    } catch (error) {
      if (!isCurrentRequest(requestId, isOperationCurrent)) return stale();
      console.error('Image IPC request failed:', error);
      return failed(request, error, '', SERVICE_ERROR_KIND.TRANSPORT);
    }
  }

  function getRetryTarget() {
    if (activeRequest?.source !== IMAGE_REQUEST_SOURCE.DATASET) return null;
    const target = getAdjacentTarget(activeRequest.direction, activeRequest.targetImageIndex);
    if (!target?.success || activeRequest.attemptedIndexes.has(target.index)) return null;
    return target;
  }

  function planFailure({ canRestorePreviousImage = false } = {}) {
    const target = getRetryTarget();
    if (target !== null) {
      return {
        action: IMAGE_FAILURE_ACTION.RETRY,
        target,
        previousRequest: activeRequest,
      };
    }
    return {
      action: canRestorePreviousImage ? IMAGE_FAILURE_ACTION.RESTORE : IMAGE_FAILURE_ACTION.CLEAR,
      previousRequest: activeRequest,
    };
  }

  return {
    getActiveRequest,
    beginManualRequest,
    beginDatasetRequest,
    clear,
    handleResponse,
    execute,
    getRetryTarget,
    planFailure,
  };
}

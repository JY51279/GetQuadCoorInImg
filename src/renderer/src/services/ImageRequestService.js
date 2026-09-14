import { normalizeCoordinateScale } from '../utils/AnnotationCoordinates.js';
import { loadRendererImage } from '../utils/RendererImageLoader.js';
import { USER_MESSAGES, toUserErrorMessage } from '../../../shared/UserMessages.js';

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

  function failed(request, error, path = '') {
    return {
      status: IMAGE_REQUEST_STATUS.FAILED,
      request,
      error: toUserErrorMessage(error, USER_MESSAGES.UNKNOWN_IMAGE_LOADING_ERROR),
      path: normalizePath(path || request?.path),
    };
  }

  async function handleResponse(response, { isOperationCurrent = () => true } = {}) {
    if (!isCurrentRequest(response?.requestId, isOperationCurrent)) return stale();
    const request = activeRequest;

    if (response.canceled) {
      return { status: IMAGE_REQUEST_STATUS.CANCELED, request };
    }
    if (!response.success) {
      return failed(request, response.error, response.path);
    }

    const imageInfo = response.imageInfo;
    try {
      const coordinateScale = normalizeCoordinateScale({
        x: imageInfo.coordinateScaleX,
        y: imageInfo.coordinateScaleY,
      });
      if (coordinateScale === null) {
        throw new Error('处理后的图片坐标缩放比例必须包含两个有限正数。');
      }

      const image = await loadImage(imageInfo.url);
      if (!isCurrentRequest(request.requestId, isOperationCurrent)) return stale();
      if (image.naturalWidth !== imageInfo.displayWidth || image.naturalHeight !== imageInfo.displayHeight) {
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
      return failed(request, error.message, imageInfo?.path);
    }
  }

  async function execute(channel, payload, { isOperationCurrent = () => true } = {}) {
    try {
      const response = await invoke(channel, payload);
      return handleResponse(response, { isOperationCurrent });
    } catch (error) {
      if (!isCurrentRequest(payload?.requestId, isOperationCurrent)) return stale();
      return failed(activeRequest, error.message);
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

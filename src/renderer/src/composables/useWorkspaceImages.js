import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';
import { computed, ref, shallowRef } from 'vue';
import {
  getAdjacentJsonImageTarget,
  getCurrentJsonImageIndex,
  getJsonImageDialogContext,
  getJsonImagePosition,
  getJsonImageTarget,
  resetPicJson,
} from '../state/DatasetState.js';
import {
  IMAGE_FAILURE_ACTION,
  IMAGE_REQUEST_SOURCE,
  IMAGE_REQUEST_STATUS,
  createImageRequestService,
} from '../services/ImageRequestService.js';
import {
  WORKFLOW_OPERATION,
  WORKFLOW_PHASE,
  canStartOperation,
  completeOperation,
  failOperation,
  isCurrentOperation,
  isOperationActive,
  isWorkflowBusy,
  operationReturnsTo,
  startImageLoad,
} from '../state/WorkflowState.js';
import { belongsToDataset, createImageSession } from '../state/ImageSession.js';
import { USER_MESSAGES, toUserErrorMessage } from '../../../shared/UserMessages.js';

// Owns the current image session and request lifecycle, never a component instance.
// Presentation is synchronous; the caller supplies view effects and its lifetime boundary.
export function useWorkspaceImages({
  workflowState,
  invoke,
  isActive,
  outputMessage,
  recordImage,
  presentImageSession,
  resetDots,
  resetZoomPreview,
  refreshCurrentAnnotations,
  clearCurrentAnnotations,
  synchronizeQuadFocusSelection,
}) {
  const imageSession = shallowRef(null);
  const imageLoadError = ref(null);
  const imagePositionView = ref({ currentIndex: -1, total: 0 });
  const jumpImageIndex = ref('');
  const hasCurrentImageSession = computed(() =>
    belongsToDataset(imageSession.value, workflowState.value.datasetVersion),
  );
  const canLoadImage = computed(() => canStartOperation(workflowState.value, WORKFLOW_OPERATION.LOAD_IMAGE));
  const isImageLoading = computed(() => isOperationActive(workflowState.value, WORKFLOW_OPERATION.LOAD_IMAGE));
  const workflowBusy = computed(() => isWorkflowBusy(workflowState.value));
  const {
    getActiveRequest,
    beginManualRequest,
    beginDatasetRequest,
    clear: resetImageRequestState,
    execute: executeImageRequest,
    planFailure: planImageRequestFailure,
  } = createImageRequestService({
    invoke,
    getAdjacentTarget: getAdjacentJsonImageTarget,
  });

  function applyWorkflowTransition(result) {
    if (!result.success) return false;
    workflowState.value = result.state;
    return true;
  }

  function refreshImagePositionView() {
    const position = getJsonImagePosition();
    imagePositionView.value = position;
    return position;
  }

  // Dataset and image initialization
  function commitImageSession(session, jsonImageIndex = null) {
    const resetPictureResult = resetPicJson(session.path, jsonImageIndex);
    imageSession.value = Object.freeze({ ...session, imageIndex: getCurrentJsonImageIndex() });
    if (!resetPictureResult.success) {
      clearCurrentAnnotations(resetPictureResult.error || '找不到与当前图片匹配的 JSON 数据。');
      refreshImagePositionView();
      jumpImageIndex.value = '';
      return false;
    }
    refreshCurrentAnnotations({ resetSelection: true, resetVisibility: true });
    const position = refreshImagePositionView();
    jumpImageIndex.value = position.currentIndex + 1;
    return true;
  }

  // Image request lifecycle
  function chooseImgFile() {
    if (!canLoadImage.value) {
      outputMessage(workflowBusy.value ? USER_MESSAGES.WAIT_FOR_CURRENT_OPERATION : USER_MESSAGES.NO_DATASET);
      return;
    }
    if (getJsonImagePosition().total === 0) {
      outputMessage('请先加载包含图片项的 JSON 图集。');
      return;
    }
    try {
      const started = startImageLoad(workflowState.value);
      if (!applyWorkflowTransition(started)) {
        outputMessage(started.error);
        return;
      }

      imageLoadError.value = null;
      const request = beginManualRequest(started.operationId);
      void requestPreparedImage(IPC_CHANNELS.OPEN_IMAGE, {
        ...getJsonImageDialogContext(),
        requestId: request.requestId,
      });
    } catch (error) {
      console.error('Error while sending IPC message open-image-file-dialog:', error);
      handleImageRequestFailure(toUserErrorMessage(error, USER_MESSAGES.IMAGE_OPEN_FAILED));
    }
  }

  function changeImageByArrowKeys(direction) {
    if (!canLoadImage.value) {
      outputMessage(USER_MESSAGES.WAIT_FOR_CURRENT_OPERATION);
      return;
    }

    const target = getAdjacentJsonImageTarget(direction, getCurrentJsonImageIndex());
    if (!target.success) {
      outputMessage(target.error);
      return;
    }
    startDatasetImageRequest(target, direction);
  }

  function jumpToImageIndex() {
    if (!canLoadImage.value) {
      outputMessage(USER_MESSAGES.WAIT_FOR_CURRENT_OPERATION);
      return;
    }

    const inputValue = String(jumpImageIndex.value).trim();
    if (!/^\d+$/.test(inputValue)) {
      outputMessage('图片序号必须是从 1 开始的整数。');
      return;
    }

    const pictureNumber = Number(inputValue);
    const { total } = getJsonImagePosition();
    if (!Number.isSafeInteger(pictureNumber) || pictureNumber < 1 || pictureNumber > total) {
      outputMessage(`图片序号必须在 1 到 ${total} 之间。`);
      return;
    }

    const target = getJsonImageTarget(pictureNumber - 1);
    if (!target.success) {
      outputMessage(target.error);
      return;
    }
    startDatasetImageRequest(target, '');
  }

  function sendImageFileRequest(path, requestId) {
    const { jsonFilePath } = getJsonImageDialogContext();
    void requestPreparedImage(IPC_CHANNELS.PREPARE_IMAGE, { imagePath: path, jsonFilePath, requestId });
    outputMessage('正在读取图片…');
  }

  async function requestPreparedImage(channel, request) {
    const result = await executeImageRequest(channel, request, {
      isOperationCurrent: operationId =>
        isActive() && isCurrentOperation(workflowState.value, operationId, WORKFLOW_OPERATION.LOAD_IMAGE),
    });
    handleImageRequestResult(result);
  }

  function startDatasetImageRequest(target, direction, previousRequest = null) {
    const currentImageIndex = getCurrentJsonImageIndex();

    let operationId;
    if (previousRequest) {
      operationId = previousRequest.operationId;
    } else {
      const started = startImageLoad(workflowState.value);
      if (!applyWorkflowTransition(started)) {
        outputMessage(started.error);
        return false;
      }
      operationId = started.operationId;
    }

    const request = beginDatasetRequest({
      operationId,
      target,
      direction,
      currentImageIndex,
      previousRequest,
    });
    imageLoadError.value = null;
    sendImageFileRequest(target.path, request.requestId);
    return true;
  }

  function handleImageRequestFailure(errorMessage, failedPath = '') {
    const failedRequest = getActiveRequest();
    if (!isCurrentImageRequest(failedRequest)) return;
    outputMessage(
      `打开图片失败${failedPath ? `：${failedPath}。` : '。'} ${errorMessage || USER_MESSAGES.UNKNOWN_IMAGE_LOADING_ERROR}`,
    );

    const canRestorePreviousImage =
      hasCurrentImageSession.value &&
      imageSession.value.imageIndex >= 0 &&
      imageSession.value.imageIndex === getCurrentJsonImageIndex() &&
      operationReturnsTo(workflowState.value, failedRequest.operationId, WORKFLOW_PHASE.READY);
    const failurePlan = planImageRequestFailure({ canRestorePreviousImage });
    if (failurePlan.action === IMAGE_FAILURE_ACTION.RETRY) {
      outputMessage(`正在跳过不可用图片，并尝试 JSON 中的第 ${failurePlan.target.index + 1} 项。`);
      startDatasetImageRequest(failurePlan.target, failedRequest.direction, failurePlan.previousRequest);
      return;
    }

    if (failurePlan.action === IMAGE_FAILURE_ACTION.RESTORE) {
      const position = refreshImagePositionView();
      jumpImageIndex.value = position.currentIndex >= 0 ? position.currentIndex + 1 : '';
      imageLoadError.value = null;
    } else {
      clearCurrentImage();
      imageLoadError.value = {
        path: failedPath,
        message: errorMessage || USER_MESSAGES.UNKNOWN_IMAGE_LOADING_ERROR,
      };
    }
    if (failedRequest?.operationId) {
      applyWorkflowTransition(
        failOperation(
          workflowState.value,
          failedRequest.operationId,
          canRestorePreviousImage ? null : WORKFLOW_PHASE.DATASET_READY,
        ),
      );
    }
    resetImageRequestState();
  }

  function isCurrentImageRequest(request) {
    return (
      isActive() &&
      request &&
      getActiveRequest()?.requestId === request.requestId &&
      isCurrentOperation(workflowState.value, request.operationId, WORKFLOW_OPERATION.LOAD_IMAGE) &&
      workflowState.value.operation.datasetVersion === workflowState.value.datasetVersion
    );
  }

  function handleImageRequestResult(result) {
    if (result.status === IMAGE_REQUEST_STATUS.STALE || !isCurrentImageRequest(result.request)) return;
    const { request } = result;
    if (result.status === IMAGE_REQUEST_STATUS.CANCELED) {
      applyWorkflowTransition(failOperation(workflowState.value, request.operationId));
      resetImageRequestState(request.requestId);
      return;
    }
    if (result.status === IMAGE_REQUEST_STATUS.FAILED) {
      handleImageRequestFailure(result.error, result.path);
      return;
    }
    if (result.status !== IMAGE_REQUEST_STATUS.READY) return;

    const previousSession = imageSession.value;
    let presentationAttempted = false;
    let isReady;
    try {
      const session = createImageSession({ ...result, datasetVersion: workflowState.value.datasetVersion });
      // Synchronous presentation is the single canvas lifecycle boundary: no prop/nextTick ordering.
      presentationAttempted = true;
      if (presentImageSession(session) !== true) throw new Error('图片画布初始化失败。');
      resetDots();
      resetZoomPreview();
      isReady = commitImageSession(
        session,
        request.source === IMAGE_REQUEST_SOURCE.DATASET ? request.targetImageIndex : null,
      );
    } catch (error) {
      console.error('Failed to present image session:', error);
      if (presentationAttempted) {
        try {
          if (!previousSession || presentImageSession(previousSession) !== true) {
            clearCurrentImage();
          } else {
            commitImageSession(previousSession, previousSession.imageIndex);
          }
        } catch {
          clearCurrentImage();
        }
      }
      handleImageRequestFailure(toUserErrorMessage(error, '图片初始化失败。'), result.imageInfo?.path);
      return;
    }
    imageLoadError.value = null;
    const imageOperationCompleted = applyWorkflowTransition(
      completeOperation(
        workflowState.value,
        request.operationId,
        isReady ? WORKFLOW_PHASE.READY : WORKFLOW_PHASE.DATASET_READY,
      ),
    );
    resetImageRequestState(request.requestId);
    if (imageOperationCompleted && isReady) {
      synchronizeQuadFocusSelection({ forceFocus: true });
      recordImage({
        datasetPath: workflowState.value.datasetTarget.path,
        imagePath: imageSession.value.path,
        imageIndex: imageSession.value.imageIndex,
      });
    }
    outputMessage(isReady ? '图片加载成功。' : '图片已加载，但没有找到匹配的 JSON 数据。');
  }

  function clearCurrentImage() {
    imageSession.value = null;
    presentImageSession(null);
    resetPicJson('');
    resetDots();
    resetZoomPreview();
    clearCurrentAnnotations();
    refreshImagePositionView();
    jumpImageIndex.value = '';
  }

  function resetForDatasetChange() {
    imageLoadError.value = null;
    resetImageRequestState();
    clearCurrentImage();
  }

  function dispose() {
    resetImageRequestState();
    imageSession.value = null;
  }

  return {
    imageSession,
    imageLoadError,
    imagePositionView,
    jumpImageIndex,
    hasCurrentImageSession,
    canLoadImage,
    isImageLoading,
    chooseImgFile,
    changeImageByArrowKeys,
    jumpToImageIndex,
    startDatasetImageRequest,
    clearCurrentImage,
    resetForDatasetChange,
    dispose,
  };
}

<template>
  <div class="container">
    <TransitionGroup name="toast" tag="div" class="toast-container">
      <div v-for="notification in notifications" :key="notification.id" class="toast-message">
        {{ notification.message }}
      </div>
    </TransitionGroup>

    <ImageView
      ref="imgContainerRef"
      :image-obj="imageObj"
      :can-edit="canOperate"
      :can-interact="canInteractWithImage"
      :is-loading="isImageLoading"
      :active-quad-index="activeQuadIndex"
      :selected-dots="selectedDots"
      :image-load-error="imageLoadError"
      @update-zoom-view="updateZoomView"
      @output-message="outputMessage"
      @update-selected-dots="updateSelectedDots"
      @select-quad-index="selectQuadIndex"
    ></ImageView>
    <div class="tool-container">
      <div>
        <div class="zoomViewBox">
          <canvas id="zoom" ref="zoomView" class="zoom-style" width="120" height="120"></canvas>
        </div>
        <div class="fileArea-style">
          <div class="fileInfo-style">产品类型: {{ loadedProductType || '未加载' }}</div>
          <div class="fileInfo-style">数据集: {{ jsonFileName }}</div>
          <div class="fileInfo-style">图片: {{ imgFileName }}</div>
          <div class="fileInfo-style">
            图片次序: <br />{{ imagePositionView.currentIndex + 1 }} / {{ imagePositionView.total }}
          </div>
          <div class="fileInfo-style">
            跳转到图片:
            <div class="image-index-jump">
              <input
                v-model="jumpImageIndex"
                class="image-index-input"
                type="number"
                min="1"
                step="1"
                :max="imagePositionView.total || undefined"
                :placeholder="imagePositionView.total ? `1-${imagePositionView.total}` : '无数据'"
                :disabled="imagePositionView.total === 0 || !canLoadImage"
                aria-label="图片 index"
                @keydown.enter.prevent="jumpToImageIndex"
              />
              <button
                class="image-index-button"
                :disabled="imagePositionView.total === 0 || !canLoadImage"
                @click="jumpToImageIndex"
              >
                跳转
              </button>
            </div>
          </div>
          <div class="fileInfo-style">矩形次序: <br />{{ activeQuadIndex + 1 }} / {{ quadTotal }}</div>
        </div>
        <div class="dotsArea-style">
          <div v-for="(item, index) in selectedDots" :key="index" class="dots">
            <span>({{ item.x }}, {{ item.y }})</span>
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end">
        <Help />
      </div>
      <div class="button-group">
        <button class="button-style" :disabled="!canLoadDataset" @click="chooseJsonFile">Get JsonFile</button>
        <button
          class="button-style"
          :disabled="imagePositionView.total === 0 || !canLoadImage"
          @click="chooseImgFile"
        >
          手动选择图片
        </button>
        <button class="button-style" :disabled="!canOperate" @click="modifyJsonItem">Mod JsonItem</button>
        <button class="button-style" :disabled="!canOperate" @click="deleteJsonItem">Del JsonItem</button>
        <button class="button-style" :disabled="!canOperate" @click="addJsonItem">Add JsonItem</button>
      </div>
    </div>

    <JsonView
      ref="jsonView"
      :active-quad-index="activeQuadIndex"
      :formatted-items="annotationView.formattedItems"
      :error-message="annotationView.errorMessage"
      @select-quad-index="selectQuadIndex"
    ></JsonView>
  </div>
</template>

<script setup>
import { computed, ref, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue';
import JsonView from './JsonView.vue';
import ImageView from './ImageView.vue';
import Help from './Help.vue';
import {
  prepareJsonProcess,
  commitPreparedJsonProcess,
  getAdjacentJsonImageTarget,
  getCurrentAnnotationView,
  getCurrentJsonImageIndex,
  getJsonImageDialogContext,
  getJsonImageTarget,
  updateJson,
  getJsonImagePosition,
  getJsonFileInfo,
  resetPicJson,
  resetJsonNoValue,
  createDatasetMutationSnapshot,
  restoreDatasetMutationSnapshot,
} from '../state/DatasetState.js';
import { KEYS } from '../utils/BasicFuncs.js';
import { loadRendererImage } from '../utils/RendererImageLoader.js';
import { configureZoomCanvas, drawZoomPreview } from '../utils/ZoomViewRenderer.js';
import {
  WORKFLOW_OPERATION,
  WORKFLOW_PHASE,
  canApplySaveResult,
  canChangeQuadSelection,
  canEdit as canEditWorkflow,
  canStartOperation,
  commitDataset,
  completeOperation,
  createWorkflowState,
  failOperation,
  isCurrentOperation,
  isOperationActive,
  isWorkflowBusy,
  operationReturnsTo,
  startDatasetLoad,
  startImageLoad,
  startSave,
} from '../state/WorkflowState.js';

const ipcRenderer = window.electron.ipcRenderer;

// Child component and canvas references
const imgContainerRef = ref(null);
const jsonView = ref(null);
const zoomView = ref(null);

// Dataset and current image state
const activeQuadIndex = ref(-1);
const annotationView = ref({ formattedItems: [], quads: [], errorMessage: '' });
const quadTotal = computed(() => annotationView.value.formattedItems.length);
const imagePositionView = ref({ currentIndex: -1, total: 0 });
const jumpImageIndex = ref('');
const selectedDots = reactive([]);
const imageObj = ref(new Image());
const imgFileName = ref(null);
const jsonFileName = ref(null);
const loadedProductType = ref('');
let imgFilePath = '';
let initImageScale = 1;

// Operation and image request state
const workflowState = ref(createWorkflowState());
const workflowBusy = computed(() => isWorkflowBusy(workflowState.value));
const canOperate = computed(() => canEditWorkflow(workflowState.value));
const canLoadDataset = computed(() => canStartOperation(workflowState.value, WORKFLOW_OPERATION.LOAD_DATASET));
const canLoadImage = computed(() => canStartOperation(workflowState.value, WORKFLOW_OPERATION.LOAD_IMAGE));
const isImageLoading = computed(() => isOperationActive(workflowState.value, WORKFLOW_OPERATION.LOAD_IMAGE));
const canInteractWithImage = computed(() => !isImageLoading.value && Boolean(imageObj.value?.src));
const imageLoadError = ref(null);
let imageChunkBuffer = '';
let activeImageRequest = null;
let imageAttemptCounter = 0;

// Notification state
const NOTIFICATION_DURATION = 3000;
const MAX_VISIBLE_NOTIFICATIONS = 4;
const notifications = ref([]);
const notificationTimers = new Map();
let notificationId = 0;

// Window input and listener state
const mouseCoord = { x: 0, y: 0 };
let removeOpenPicFileResponseListener = null;
let removeChooseJsonFileResponseListener = null;

function applyWorkflowTransition(result) {
  if (!result.success) return false;
  workflowState.value = result.state;
  return true;
}

function selectQuadIndex(newIndex) {
  if (!canChangeQuadSelection(workflowState.value)) return;
  const normalizedIndex = Number.isInteger(newIndex) && newIndex >= 0 && newIndex < quadTotal.value ? newIndex : -1;

  activeQuadIndex.value = normalizedIndex;
}

function resetQuadSelection() {
  activeQuadIndex.value = -1;
}

function handleWindowMouseMove(e) {
  mouseCoord.x = e.clientX;
  mouseCoord.y = e.clientY;
}

onMounted(() => {
  configureZoomCanvas(zoomView.value);
  window.addEventListener('mousemove', handleWindowMouseMove);
  window.addEventListener('keydown', handleKeyDown);
  removeOpenPicFileResponseListener = ipcRenderer.on('open-pic-file-response', handleOpenPicFileResponse);
  removeChooseJsonFileResponseListener = ipcRenderer.on('choose-json-file-response', handleChooseJsonFileResponse);
});

onUnmounted(() => {
  window.removeEventListener('mousemove', handleWindowMouseMove);
  window.removeEventListener('keydown', handleKeyDown);
  removeOpenPicFileResponseListener?.();
  removeChooseJsonFileResponseListener?.();
  removeOpenPicFileResponseListener = null;
  removeChooseJsonFileResponseListener = null;
  clearMessage();
});

// Keyboard shortcuts
const keyActions = {
  w: {
    default: () => changeJsonItemSelection(KEYS.PREVIOUS),
  },
  s: {
    default: () => changeJsonItemSelection(KEYS.NEXT),
    ctrl: () => modifyJsonItem(),
  },
  d: {
    default: () => changeImageByArrowKeys(KEYS.NEXT),
    ctrl: () => deleteJsonItem(),
  },
  a: {
    default: () => changeImageByArrowKeys(KEYS.PREVIOUS),
    ctrl: () => addJsonItem(),
  },
  c: {
    default: () => clearMessage(),
    ctrl: () => clearDots(),
  },
  r: {
    default: () => resetPosition(),
    ctrl: () => resetJsonValue(),
  },
  q: {
    default: () => toggleHighlight2ShowQuads(),
    ctrl: () => clearShowQuads(),
  },
  Q: {
    ctrl_shift: () => addAll2ShowQuads(), // shift + q ==> Q
  },
  ArrowLeft: {
    default: () => changeImageByArrowKeys(KEYS.PREVIOUS),
  },
  ArrowRight: {
    default: () => changeImageByArrowKeys(KEYS.NEXT),
  },
  ArrowUp: {
    default: () => changeJsonItemSelection(KEYS.PREVIOUS),
  },
  ArrowDown: {
    default: () => changeJsonItemSelection(KEYS.NEXT),
  },
  Tab: {
    default: () => toggleMode(),
  },
};

function handleKeyDown(e) {
  const tagName = e.target?.tagName;
  if (e.target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) return;

  const keyCode = e.keyCode || e.code;

  if (keyCode >= 48 && keyCode <= 57) {
    const digit = keyCode - 48;
    clearOneDot(digit - 1);
    return;
  }
  const action = keyActions[e.key];
  if (!action) return;

  if (e.ctrlKey && e.shiftKey && action.ctrl_shift) {
    e.preventDefault();
    action.ctrl_shift();
  } else if (e.ctrlKey && action.ctrl) {
    e.preventDefault();
    action.ctrl();
  } else if (action.default) {
    e.preventDefault();
    action.default();
  }
}

// Notifications
function removeNotification(id) {
  notifications.value = notifications.value.filter(notification => notification.id !== id);
  const timer = notificationTimers.get(id);
  if (timer) clearTimeout(timer);
  notificationTimers.delete(id);
}

function outputMessage(message) {
  const notification = { id: ++notificationId, message: String(message) };
  notifications.value.push(notification);

  if (notifications.value.length > MAX_VISIBLE_NOTIFICATIONS) {
    removeNotification(notifications.value[0].id);
  }

  const timer = setTimeout(() => removeNotification(notification.id), NOTIFICATION_DURATION);
  notificationTimers.set(notification.id, timer);
}

// Child component commands
function clearOneDot(index) {
  if (!canOperate.value) return;
  if (Number.isInteger(index) && index >= 0 && index < selectedDots.length) selectedDots.splice(index, 1);
}

function changeJsonItemSelection(direction) {
  if (!canOperate.value) return;
  if (direction === KEYS.NEXT) {
    selectQuadIndex(Math.min(activeQuadIndex.value + 1, quadTotal.value));
  } else if (direction === KEYS.PREVIOUS) {
    selectQuadIndex(Math.max(activeQuadIndex.value - 1, -1));
  }
}

function resetPosition() {
  imgContainerRef.value.resetPosition();
}

function resetDots() {
  selectedDots.splice(0, selectedDots.length);
}

function clearDots() {
  if (!canOperate.value) return;
  resetDots();
}

// JSON Operations
async function runSaveTransaction(mutate, onSaved = () => {}) {
  const sourceImageIndex = getCurrentJsonImageIndex();
  const started = startSave(workflowState.value, { sourceImageIndex });
  if (!applyWorkflowTransition(started)) {
    outputMessage(started.error);
    return false;
  }

  const operationId = started.operationId;
  const datasetSnapshot = createDatasetMutationSnapshot();
  let completionPhase = null;
  let operationCompleted = false;

  function finishOperation() {
    if (operationCompleted) return true;
    operationCompleted = applyWorkflowTransition(
      completeOperation(workflowState.value, operationId, completionPhase),
    );
    return operationCompleted;
  }

  try {
    const mutationError = mutate();
    if (mutationError !== null) {
      outputMessage(mutationError);
      return false;
    }

    const saved = await saveJsonFile();
    if (!canApplySaveResult(workflowState.value, operationId, getCurrentJsonImageIndex())) {
      outputMessage('Ignored a stale save result because the dataset or image context changed.');
      return false;
    }

    if (!saved) {
      if (!restoreDatasetMutationSnapshot(datasetSnapshot)) {
        outputMessage('Failed to restore JSON state after the save error. Please reload the dataset.');
        completionPhase = WORKFLOW_PHASE.DATASET_READY;
        clearCurrentAnnotations('JSON state is unavailable. Please reload the dataset.');
      }
      return false;
    }

    if (!finishOperation()) return false;
    onSaved();
    return true;
  } finally {
    if (isCurrentOperation(workflowState.value, operationId, WORKFLOW_OPERATION.SAVE)) finishOperation();
  }
}

async function performJsonAction(action) {
  if (!canOperate.value) {
    outputMessage('JSON operation is disabled until the image matches the dataset.');
    return;
  }

  await runSaveTransaction(
    () => {
      outputMessage('Start operate: ' + action);
      const updateJsonRes = updateJson(action, initImageScale, activeQuadIndex.value, selectedDots);
      return updateJsonRes === KEYS.OPERATE_SUCCESS ? null : updateJsonRes;
    },
    () => {
      refreshCurrentAnnotations();
      if (action === KEYS.JSON_ADD) nextTick(() => jsonView.value?.scrollToBottom());
      resetDots();
    },
  );
}

function addJsonItem() {
  performJsonAction(KEYS.JSON_ADD);
}

function deleteJsonItem() {
  performJsonAction(KEYS.JSON_DELETE);
}

function modifyJsonItem() {
  performJsonAction(KEYS.JSON_MODIFY);
}

async function resetJsonValue() {
  await runSaveTransaction(
    () => (resetJsonNoValue() ? null : 'Reset No. failed!'),
    () => {
      refreshCurrentAnnotations();
      outputMessage('Reset No. successfully.');
    },
  );
}

async function saveJsonFile() {
  return saveJsonFileInfo(getJsonFileInfo());
}

async function saveJsonFileInfo(jsonFileInfo) {
  try {
    const response = await ipcRenderer.invoke('save-json-file', jsonFileInfo);
    if (!response.success) {
      const errorMessage = response.error || 'Unknown error';
      console.error('Failed to save JSON file:', errorMessage);
      outputMessage(`Failed to save JSON: ${errorMessage}`);
      return false;
    }
    return true;
  } catch (error) {
    console.error('An error occurred while saving JSON file:', error);
    outputMessage(`Failed to save JSON: ${error.message}`);
    return false;
  }
}

function clearMessage() {
  for (const timer of notificationTimers.values()) clearTimeout(timer);
  notificationTimers.clear();
  notifications.value = [];
}

function refreshImagePositionView() {
  const position = getJsonImagePosition();
  imagePositionView.value = position;
  return position;
}

// Dataset and image initialization
async function initProcessInfo(jsonImageIndex = null) {
  try {
    if (!imageObj.value || imageObj.value.src === '') {
      outputMessage('initProcessInfo Error.');
      return false;
    } else {
      await nextTick();
      if (!(await imgContainerRef.value.initImgInfo())) return false;
    }

    if (!resetPicJson(imgFilePath, jsonImageIndex)) {
      clearCurrentAnnotations(
        imgFilePath
          ? `No JSON data found for image path:\n${imgFilePath}`
          : 'No JSON data found for the current image.',
      );
      refreshImagePositionView();
      jumpImageIndex.value = '';
      return false;
    }
    refreshCurrentAnnotations();

    // Switching images does not fire mousemove when the pointer stays still.
    // Wait for the new quad overlay, then synchronize its hover selection before
    // JSON operations are enabled.
    await nextTick();
    imgContainerRef.value.refreshHoveredQuad();
    await nextTick();

    const position = refreshImagePositionView();
    jumpImageIndex.value = position.currentIndex + 1;
    return true;
  } catch (error) {
    console.error(`Error name: ${error.name}`);
    console.error(`Error message: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);
  }
}

function renderAnnotationQuads() {
  imgContainerRef.value.resetQuadsArray(annotationView.value.quads, initImageScale);
  clearShowQuads();
  addAll2ShowQuads();
}

function refreshCurrentAnnotations() {
  resetQuadSelection();
  annotationView.value = { ...getCurrentAnnotationView(), errorMessage: '' };
  renderAnnotationQuads();
}

function clearCurrentAnnotations(errorMessage = '') {
  resetQuadSelection();
  annotationView.value = { formattedItems: [], quads: [], errorMessage };
  renderAnnotationQuads();
}
// Image request lifecycle
function chooseImgFile() {
  if (!canLoadImage.value) {
    outputMessage(workflowBusy.value ? 'Please wait for the current operation to finish.' : 'No dataset is available.');
    return;
  }
  if (getJsonImagePosition().total === 0) {
    outputMessage('Please load a JSON dataset with image items first.');
    return;
  }
  try {
    const started = startImageLoad(workflowState.value);
    if (!applyWorkflowTransition(started)) {
      outputMessage(started.error);
      return;
    }

    imageLoadError.value = null;
    imageChunkBuffer = '';
    const requestId = ++imageAttemptCounter;
    activeImageRequest = {
      requestId,
      operationId: started.operationId,
      source: 'manual',
      targetImageIndex: null,
      path: '',
      direction: '',
      attemptedIndexes: new Set(),
    };
    ipcRenderer.send('open-image-file-dialog', { ...getJsonImageDialogContext(), requestId });
  } catch (error) {
    console.error('Error while sending IPC message open-image-file-dialog:', error);
    handleImageRequestFailure(error.message);
  }
}

function changeImageByArrowKeys(direction) {
  if (!canLoadImage.value) {
    outputMessage('Please wait for the current operation to finish.');
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
    outputMessage('Please wait for the current operation to finish.');
    return;
  }

  const inputValue = String(jumpImageIndex.value).trim();
  if (!/^\d+$/.test(inputValue)) {
    outputMessage('Image index must be an integer starting from 1.');
    return;
  }

  const pictureNumber = Number(inputValue);
  const { total } = getJsonImagePosition();
  if (!Number.isSafeInteger(pictureNumber) || pictureNumber < 1 || pictureNumber > total) {
    outputMessage(`Image index must be between 1 and ${total}.`);
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
  imageChunkBuffer = '';
  const { jsonFilePath } = getJsonImageDialogContext();
  ipcRenderer.send('open-pic-file', { imagePath: path, jsonFilePath, requestId });
  outputMessage('Get file response...');
}

function startDatasetImageRequest(target, direction, previousRequest = null) {
  const attemptedIndexes = previousRequest?.attemptedIndexes ?? new Set();
  const currentImageIndex = getCurrentJsonImageIndex();
  if (!previousRequest && currentImageIndex >= 0) attemptedIndexes.add(currentImageIndex);
  attemptedIndexes.add(target.index);

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

  const requestId = ++imageAttemptCounter;
  activeImageRequest = {
    requestId,
    operationId,
    source: 'dataset',
    targetImageIndex: target.index,
    path: target.path,
    direction,
    attemptedIndexes,
  };
  imageLoadError.value = null;
  sendImageFileRequest(target.path, requestId);
  return true;
}

function retryDatasetImageRequest() {
  const failedRequest = activeImageRequest;
  if (failedRequest?.source !== 'dataset') return false;

  const nextTarget = getAdjacentJsonImageTarget(failedRequest.direction, failedRequest.targetImageIndex);
  if (!nextTarget.success || failedRequest.attemptedIndexes.has(nextTarget.index)) return false;

  outputMessage(`Skipping unavailable image and trying JSON item ${nextTarget.index + 1}.`);
  startDatasetImageRequest(nextTarget, failedRequest.direction, failedRequest);
  return true;
}

function resetImageRequestState() {
  activeImageRequest = null;
  imageChunkBuffer = '';
}

function handleImageRequestFailure(errorMessage, failedPath = '') {
  const failedRequest = activeImageRequest;
  outputMessage(`Failed to open image${failedPath ? `: ${failedPath}` : ''}.`);
  outputMessage(errorMessage || 'Unknown image loading error.');

  if (retryDatasetImageRequest()) return;

  const canRestorePreviousImage = operationReturnsTo(
    workflowState.value,
    failedRequest?.operationId,
    WORKFLOW_PHASE.READY,
  );
  if (canRestorePreviousImage) {
    const position = refreshImagePositionView();
    jumpImageIndex.value = position.currentIndex >= 0 ? position.currentIndex + 1 : '';
    imageLoadError.value = null;
  } else {
    imageObj.value = null;
    imgFileName.value = '';
    imgFilePath = '';
    refreshImagePositionView();
    jumpImageIndex.value = '';
    imageLoadError.value = {
      path: failedPath,
      message: errorMessage || 'Unknown image loading error.',
    };
    resetDots();
  }
  if (failedRequest?.operationId) {
    applyWorkflowTransition(failOperation(workflowState.value, failedRequest.operationId));
  }
  resetImageRequestState();
}

async function handleOpenPicFileResponse(_event, response) {
  if (!activeImageRequest || response?.requestId !== activeImageRequest.requestId) return;
  if (!isCurrentOperation(workflowState.value, activeImageRequest.operationId, WORKFLOW_OPERATION.LOAD_IMAGE)) return;

  if (response.canceled) {
    const canceledRequest = activeImageRequest;
    applyWorkflowTransition(failOperation(workflowState.value, canceledRequest.operationId));
    resetImageRequestState();
    return;
  }

  if (response.success) {
    imageChunkBuffer += response.picInfo.str;
    if (response.picInfo.fileName === '') return;

    const completedRequest = activeImageRequest;
    try {
      const loadedImage = await loadRendererImage(imageChunkBuffer);
      imageObj.value = loadedImage.image;
      initImageScale = loadedImage.initialScale;
    } catch (error) {
      handleImageRequestFailure(error.message, response.picInfo.path || completedRequest?.path || '');
      return;
    }

    imgFileName.value = response.picInfo.fileName;
    imgFilePath = response.picInfo.path.replace(/\\/g, '/');
    imageLoadError.value = null;
    const requestedJsonImageIndex = completedRequest?.source === 'dataset' ? completedRequest.targetImageIndex : null;
    const isReady = await initProcessInfo(requestedJsonImageIndex);
    applyWorkflowTransition(
      completeOperation(
        workflowState.value,
        completedRequest.operationId,
        isReady ? WORKFLOW_PHASE.READY : WORKFLOW_PHASE.DATASET_READY,
      ),
    );
    resetImageRequestState();
    outputMessage(isReady ? 'Load Pic Successfully.' : 'Image loaded, but no matching JSON data was found.');
  } else {
    const failedPath = (response.path || '').replace(/[\\/]/g, '/');
    handleImageRequestFailure(response.error, failedPath);
  }
}

function resetImageForDatasetChange() {
  imageObj.value = null;
  imgFileName.value = '';
  imgFilePath = '';
  imageLoadError.value = null;
  resetImageRequestState();
  refreshImagePositionView();
  jumpImageIndex.value = '';
  resetDots();
  imgContainerRef.value.clearImage();
  clearCurrentAnnotations();
}

function chooseJsonFile() {
  if (!canLoadDataset.value) {
    outputMessage('Please wait for the current operation to finish.');
    return;
  }
  const started = startDatasetLoad(workflowState.value);
  if (!applyWorkflowTransition(started)) {
    outputMessage(started.error);
    return;
  }
  try {
    ipcRenderer.send('open-json-file-dialog', { requestId: started.operationId });
  } catch (error) {
    console.error('Error while sending IPC message open-json-file-dialog:', error);
    applyWorkflowTransition(failOperation(workflowState.value, started.operationId));
  }
}

function failDatasetLoad(operationId, message = '') {
  if (message) outputMessage(message);
  applyWorkflowTransition(failOperation(workflowState.value, operationId));
}

// Dataset loading
async function handleChooseJsonFileResponse(_event, response) {
  const operationId = response?.requestId;
  if (!isCurrentOperation(workflowState.value, operationId, WORKFLOW_OPERATION.LOAD_DATASET)) return;

  if (response.canceled) {
    failDatasetLoad(operationId);
    return;
  }

  try {
    if (response.success) {
      const jsonData = response.jsonInfo;
      jsonData.path = jsonData.path.replace(/[\\/]/g, '/');
      const preparedJson = prepareJsonProcess(jsonData);
      if (!preparedJson.success) {
        failDatasetLoad(operationId, `Failed to load JSON: ${preparedJson.error}`);
        return;
      }

      const resolvedPathResult = await ipcRenderer.invoke('resolve-json-image-paths', {
        jsonFilePath: preparedJson.path,
        imagePaths: preparedJson.imagePaths,
      });
      if (!isCurrentOperation(workflowState.value, operationId, WORKFLOW_OPERATION.LOAD_DATASET)) return;
      if (!resolvedPathResult.success) {
        failDatasetLoad(operationId, `Failed to resolve JSON image paths: ${resolvedPathResult.error}`);
        return;
      }
      preparedJson.imagePaths = resolvedPathResult.imagePaths.map(imagePath => imagePath.replace(/[\\/]/g, '/'));

      if (preparedJson.changed) {
        if (!(await saveJsonFileInfo(preparedJson.fileInfo))) {
          failDatasetLoad(operationId);
          return;
        }
        if (!isCurrentOperation(workflowState.value, operationId, WORKFLOW_OPERATION.LOAD_DATASET)) return;
      }

      if (!commitPreparedJsonProcess(preparedJson)) {
        failDatasetLoad(operationId, 'Failed to load JSON: unable to commit the prepared dataset.');
        return;
      }
      if (!applyWorkflowTransition(commitDataset(workflowState.value, operationId))) return;

      loadedProductType.value = preparedJson.productType;
      jsonFileName.value = jsonData.fileName;
      resetImageForDatasetChange();
      if (preparedJson.repairSummary) outputMessage(preparedJson.repairSummary);

      if (preparedJson.data.Picture.length === 0) {
        outputMessage('JSON loaded successfully, but the dataset contains no valid image items.');
      } else {
        const firstImageTarget = getJsonImageTarget(0);
        if (!firstImageTarget.success) {
          outputMessage(firstImageTarget.error);
          return;
        }
        startDatasetImageRequest(firstImageTarget, KEYS.NEXT);
      }
    } else {
      const errorMessage = response.error || 'Unknown JSON loading error.';
      console.error('Failed to read JSON file:', errorMessage);
      failDatasetLoad(operationId, `Failed to read JSON file: ${errorMessage}`);
    }
  } catch (error) {
    console.error('An error occurred while processing JSON file:', error);
    failDatasetLoad(operationId, `Failed to process JSON file: ${error.message}`);
  }
}

function updateSelectedDots(newSelectedDots) {
  if (!Array.isArray(newSelectedDots)) return;
  selectedDots.splice(0, selectedDots.length, ...newSelectedDots.map(dot => ({ ...dot })));
}

watch(selectedDots, () => {
  updateZoomView();
});

// Zoom preview
function updateZoomView() {
  const origin = imgContainerRef.value?.realDot2GetZoom;
  if (!imageObj.value?.complete || !origin || origin.x === -1) return;

  try {
    drawZoomPreview(zoomView.value, imageObj.value, origin, selectedDots);
  } catch (error) {
    console.error('Failed to draw the zoom preview:', error);
  }
}

// Show quad
function toggleHighlight2ShowQuads() {
  imgContainerRef.value.toggleShowQuadIndex(activeQuadIndex.value);
}
function addAll2ShowQuads() {
  for (let i = 0; i < quadTotal.value; ++i) {
    imgContainerRef.value.addShowQuadIndex(i);
  }
}

function clearShowQuads() {
  imgContainerRef.value.clearShowQuadIndex();
}

function toggleMode() {
  imgContainerRef.value.toggleMode();
}
</script>

<style scoped>
* {
  user-select: none;
}
/* 添加样式来高亮当前行 */
.container {
  display: flex;
  width: 100%;
  height: 100%;
  padding: 20px;
  background-color: white;
}

.tool-container {
  position: relative;
  width: 122px;
  height: 100%;
  display: flex;
  flex-direction: column;
  margin-left: calc(75% - 130px);
  justify-content: space-between;
  overflow-y: auto;
  padding-right: 2px;
}
.zoomViewBox {
  border: 1px dotted #333;
  margin-bottom: 10px;
  display: flex;
}
.zoom-style {
  width: 120px;
  height: 120px;
  border: none;
}

.fileArea-style {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  row-gap: 10px;
}
.fileInfo-style {
  font-family: 'Microsoft YaHei', sans-serif; /* 使用微软雅黑字体 */
  color: #000000;
  font-size: 15px;
  line-height: 1.5; /* 行高为 1.5 */
  word-wrap: break-word;
}
.image-index-jump {
  display: flex;
  gap: 4px;
  margin-top: 4px;
}
.image-index-input {
  min-width: 0;
  width: 68px;
  box-sizing: border-box;
}
.image-index-button {
  flex: 1;
  padding: 2px 4px;
  border: 1px solid #888;
  border-radius: 4px;
  cursor: pointer;
}
.image-index-button:disabled {
  cursor: default;
}
.dotsArea-style {
  height: 100px;
  margin-top: 10px;
}

.dots {
  margin-top: 5px;
}
.toast-container {
  position: fixed;
  top: 16px;
  left: 50%;
  z-index: 10000;
  display: flex;
  width: min(720px, calc(100vw - 32px));
  flex-direction: column;
  gap: 8px;
  transform: translateX(-50%);
  pointer-events: none;
}
.toast-message {
  box-sizing: border-box;
  padding: 10px 14px;
  border-radius: 6px;
  background-color: rgba(35, 35, 35, 0.92);
  color: white;
  font-size: 14px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.25);
}
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.button-style {
  border-radius: 12px;
  background-color: #4caf50;
  color: white;
  border: none;
  padding: 8px 8px;
  text-align: center;
  text-decoration: none;
  font-size: 15px;
  width: calc(100%);
  cursor: pointer;
  transition: background-color 0.3s ease;
}
.button-style:hover {
  background-color: #ff3333; /* 设置按钮的背景颜色悬停时的颜色 */
}
.button-style:disabled,
.button-style:disabled:hover {
  background-color: #b8b8b8;
  color: #f3f3f3;
  opacity: 0.7;
  cursor: not-allowed;
}
.button-group {
  display: flex;
  flex-direction: column;
  row-gap: 10px;
}
</style>

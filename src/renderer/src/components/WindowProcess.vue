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
      :image-load-error-path="imageLoadErrorPath"
      @update-zoom-view="updateZoomView"
      @output-message="outputMessage"
      @update-dots-real-coord="updateDotsRealCoord"
      @update-json-highlight-index="updateJsonHighlightIndex"
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
          <div class="fileInfo-style">图片次序: <br />{{ picInfo.picNum }} / {{ picInfo.picTotalNum }}</div>
          <div class="fileInfo-style">
            跳转到图片:
            <div class="image-index-jump">
              <input
                v-model="jumpImageIndex"
                class="image-index-input"
                type="number"
                min="1"
                step="1"
                :max="picInfo.picTotalNum || undefined"
                :placeholder="picInfo.picTotalNum ? `1-${picInfo.picTotalNum}` : '无数据'"
                :disabled="picInfo.picTotalNum === 0 || isImageRequestInProgress"
                aria-label="图片 index"
                @keydown.enter.prevent="jumpToImageIndex"
              />
              <button
                class="image-index-button"
                :disabled="picInfo.picTotalNum === 0 || isImageRequestInProgress"
                @click="jumpToImageIndex"
              >
                跳转
              </button>
            </div>
          </div>
          <div class="fileInfo-style">矩形次序: <br />{{ quadInfo.quadNum }} / {{ quadInfo.quadTotal }}</div>
        </div>
        <div class="dotsArea-style">
          <div v-for="(item, index) in dotsRealCoord" :key="index" class="dots">
            <span>({{ item.x }}, {{ item.y }})</span>
            <!-- <button class="button-delete-style" @click="clearOneDot(index)">x</button>-->
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end">
        <Help />
      </div>
      <div class="button-group">
        <button class="button-style" :disabled="isImageRequestInProgress" @click="chooseJsonFile">Get JsonFile</button>
        <button
          class="button-style"
          :disabled="picInfo.picTotalNum === 0 || isImageRequestInProgress"
          @click="chooseImgFile"
        >
          手动选择图片
        </button>
        <button class="button-style" :disabled="!canOperate || isSaving" @click="modifyJsonItem">Mod JsonItem</button>
        <button class="button-style" :disabled="!canOperate || isSaving" @click="deleteJsonItem">Del JsonItem</button>
        <button class="button-style" :disabled="!canOperate || isSaving" @click="addJsonItem">Add JsonItem</button>
        <!--TODO 目前的布局放不下了才暂时注释了三个不咋重要的！！！
          <button class="button-style" @click="clearDots">Clear Dots</button>
        <button class="button-style" @click="clearMessage">Clear Msgs</button>
        <button class="button-style" @click="resetPosition">Reset Pos</button>
       -->
      </div>
    </div>

    <JsonView ref="jsonView" @update-quad-info="updateQuadInfo" @init-show-quads="initShowQuads"></JsonView>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue';
import JsonView from './JsonView.vue';
import ImageView from './ImageView.vue';
import Help from './Help.vue';
import {
  prepareJsonProcess,
  commitPreparedJsonProcess,
  getAdjacentJsonImageTarget,
  getJsonImageDialogContext,
  getJsonImageTarget,
  updateQuadIndex,
  updateJson,
  getJsonPicNum,
  getJsonFileInfo,
  getJsonPerPicPointsArray,
  resetJsonNoValue,
} from '../state/DatasetState.js';
import { KEYS } from '../utils/BasicFuncs.js';
import { loadRendererImage } from '../utils/RendererImageLoader.js';
import { configureZoomCanvas, drawZoomPreview } from '../utils/ZoomViewRenderer.js';

const ipcRenderer = window.electron.ipcRenderer;

// Child component and canvas references
const imgContainerRef = ref(null);
const jsonView = ref(null);
const zoomView = ref(null);

// Dataset and current image state
const quadInfo = reactive({ quadNum: 0, quadTotal: 0 });
const picInfo = reactive({ picNum: 0, picTotalNum: 0 });
const jumpImageIndex = ref('');
const dotsRealCoord = reactive([]);
const imageObj = ref(new Image());
const imgFileName = ref(null);
const jsonFileName = ref(null);
const loadedProductType = ref('');
let imgFilePath = '';
let initImageScale = 1;

// Operation and image request state
const canOperate = ref(false);
const isSaving = ref(false);
const isImageRequestInProgress = ref(false);
const imageLoadErrorPath = ref('');
let imageChunkBuffer = '';
let activeImageRequest = null;

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

function updateQuadInfo(quadNum = -1, quadTotal = -1) {
  if (quadNum !== -1) quadInfo.quadNum = quadNum;
  if (quadTotal !== -1) quadInfo.quadTotal = quadTotal;
}
watch(quadInfo, newQuadInfo => {
  updateQuadIndex(newQuadInfo.quadNum - 1);
  imgContainerRef.value.resetHighlightQuadIndex(newQuadInfo.quadNum - 1);
});

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
    default: () => jsonView.value.updateLightIndex(KEYS.PREVIOUS),
  },
  s: {
    default: () => jsonView.value.updateLightIndex(KEYS.NEXT),
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
    default: () => jsonView.value.updateLightIndex(KEYS.PREVIOUS),
  },
  ArrowDown: {
    default: () => jsonView.value.updateLightIndex(KEYS.NEXT),
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
  imgContainerRef.value.deletePt(index);
}

function resetPosition() {
  imgContainerRef.value.resetPosition();
}

function clearDots() {
  imgContainerRef.value.clearDots();
}

// JSON Operations
async function performJsonAction(action) {
  if (!canOperate.value) {
    outputMessage('JSON operation is disabled until the image matches the dataset.');
    return;
  }
  if (isSaving.value) {
    return;
  }

  isSaving.value = true;
  try {
    outputMessage('Start operate: ' + action);
    const updateJsonRes = updateJson(action, initImageScale);
    if (updateJsonRes !== KEYS.OPERATE_SUCCESS) {
      outputMessage(updateJsonRes);
      return;
    }

    switch (action) {
      case KEYS.JSON_ADD:
        jsonView.value.addJsonItem();
        break;
      case KEYS.JSON_DELETE:
        jsonView.value.deleteJsonItem();
        break;
      case KEYS.JSON_MODIFY:
        jsonView.value.modifyJsonItem();
        break;
    }
    clearDots();
    await saveJsonFile();
  } finally {
    isSaving.value = false;
  }
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
  if (isSaving.value) return;

  if (resetJsonNoValue()) {
    outputMessage('Reset No. successfully.');
    isSaving.value = true;
    try {
      await saveJsonFile();
    } finally {
      isSaving.value = false;
    }
  } else outputMessage('Reset No. failed!');
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

// Dataset and image initialization
async function initProcessInfo(jsonImageIndex = null) {
  try {
    if (!imageObj.value || imageObj.value.src === '') {
      outputMessage('initProcessInfo Error.');
      canOperate.value = false;
      imgContainerRef.value.resetIsImgFileLoading(false);
      return false;
    } else {
      await nextTick();
      if (!(await imgContainerRef.value.initImgInfo())) {
        canOperate.value = false;
        imgContainerRef.value.resetIsImgFileLoading(false);
        return false;
      }
      imgContainerRef.value.changeMouseState(false);
    }

    if (!jsonView.value.initJsonInfo(imgFilePath, jsonImageIndex)) {
      picInfo.picNum = 0;
      jumpImageIndex.value = '';
      canOperate.value = false;
      imgContainerRef.value.resetIsImgFileLoading(false);
      return false;
    }

    const { picNum, picTotalNum } = getJsonPicNum();
    picInfo.picNum = picNum;
    picInfo.picTotalNum = picTotalNum;
    jumpImageIndex.value = picNum;
    canOperate.value = true;
    imgContainerRef.value.resetIsImgFileLoading(false);
    return true;
  } catch (error) {
    canOperate.value = false;
    imgContainerRef.value.resetIsImgFileLoading(false);
    console.error(`Error name: ${error.name}`);
    console.error(`Error message: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);
  }
}

function initShowQuads() {
  const newShowQuadArray = getJsonPerPicPointsArray();
  imgContainerRef.value.resetQuadsArray(newShowQuadArray, initImageScale);
  clearShowQuads();
  addAll2ShowQuads();
  updateJsonHighlightIndex(-1);
}
// Image request lifecycle
function chooseImgFile() {
  if (isImageRequestInProgress.value) {
    outputMessage('Please wait for the current image to finish loading.');
    return;
  }
  if (picInfo.picTotalNum === 0) {
    outputMessage('Please load a JSON dataset with image items first.');
    return;
  }
  try {
    imageChunkBuffer = '';
    activeImageRequest = null;
    ipcRenderer.send('open-image-file-dialog', getJsonImageDialogContext());
  } catch (error) {
    console.error('Error while sending IPC message open-image-file-dialog:', error);
  }
}

function changeImageByArrowKeys(direction) {
  if (isImageRequestInProgress.value) {
    outputMessage('Please wait for the current image to finish loading.');
    return;
  }

  const target = getAdjacentJsonImageTarget(direction);
  if (!target.success) {
    outputMessage(target.error);
    return;
  }
  startDatasetImageRequest(target, direction);
}

function jumpToImageIndex() {
  if (isImageRequestInProgress.value) {
    outputMessage('Please wait for the current image to finish loading.');
    return;
  }

  const inputValue = String(jumpImageIndex.value).trim();
  if (!/^\d+$/.test(inputValue)) {
    outputMessage('Image index must be an integer starting from 1.');
    return;
  }

  const pictureNumber = Number(inputValue);
  if (!Number.isSafeInteger(pictureNumber) || pictureNumber < 1 || pictureNumber > picInfo.picTotalNum) {
    outputMessage(`Image index must be between 1 and ${picInfo.picTotalNum}.`);
    return;
  }

  const target = getJsonImageTarget(pictureNumber - 1);
  if (!target.success) {
    outputMessage(target.error);
    return;
  }
  startDatasetImageRequest(target, '');
}

function sendImageFileRequest(path) {
  imageChunkBuffer = '';
  const { jsonFilePath } = getJsonImageDialogContext();
  ipcRenderer.send('open-pic-file', { imagePath: path, jsonFilePath });
  outputMessage('Get file response...');
}

function startDatasetImageRequest(target, direction, previousRequest = null) {
  const attemptedIndexes = previousRequest?.attemptedIndexes ?? new Set();
  if (!previousRequest && picInfo.picNum > 0) attemptedIndexes.add(picInfo.picNum - 1);
  attemptedIndexes.add(target.index);

  activeImageRequest = {
    source: 'dataset',
    index: target.index,
    path: target.path,
    direction,
    attemptedIndexes,
    previousCanOperate: previousRequest?.previousCanOperate ?? canOperate.value,
  };
  isImageRequestInProgress.value = true;
  canOperate.value = false;
  imgContainerRef.value.resetIsImgFileLoading(true);
  sendImageFileRequest(target.path);
}

function ensureManualImageRequest() {
  if (activeImageRequest) return;
  activeImageRequest = {
    source: 'manual',
    index: null,
    path: '',
    direction: '',
    attemptedIndexes: new Set(),
    previousCanOperate: canOperate.value,
  };
  isImageRequestInProgress.value = true;
  canOperate.value = false;
}

function retryDatasetImageRequest() {
  const failedRequest = activeImageRequest;
  if (failedRequest?.source !== 'dataset') return false;

  const nextTarget = getAdjacentJsonImageTarget(failedRequest.direction);
  if (!nextTarget.success || failedRequest.attemptedIndexes.has(nextTarget.index)) return false;

  outputMessage(`Skipping unavailable image and trying JSON item ${nextTarget.index + 1}.`);
  startDatasetImageRequest(nextTarget, failedRequest.direction, failedRequest);
  return true;
}

function resetImageRequestState() {
  activeImageRequest = null;
  imageChunkBuffer = '';
  isImageRequestInProgress.value = false;
}

function handleImageRequestFailure(errorMessage, failedPath = '') {
  const failedRequest = activeImageRequest;
  outputMessage(`Failed to open image${failedPath ? `: ${failedPath}` : ''}.`);
  outputMessage(errorMessage || 'Unknown image loading error.');

  if (retryDatasetImageRequest()) return;

  const canRestorePreviousImage = failedRequest?.previousCanOperate === true;
  if (canRestorePreviousImage) {
    canOperate.value = true;
    jumpImageIndex.value = picInfo.picNum || '';
    imageLoadErrorPath.value = '';
    imgContainerRef.value.changeMouseState(false);
  } else {
    imageObj.value = null;
    imgFileName.value = '';
    imgFilePath = '';
    picInfo.picNum = 0;
    jumpImageIndex.value = '';
    imageLoadErrorPath.value = failedPath;
    imgContainerRef.value.clearDots();
  }
  imgContainerRef.value.resetIsImgFileLoading(false);
  resetImageRequestState();
}

async function handleOpenPicFileResponse(_event, response) {
  ensureManualImageRequest();
  imgContainerRef.value.resetIsImgFileLoading(true);
  imgContainerRef.value.changeMouseState(true);
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
    imageLoadErrorPath.value = '';
    const requestedJsonImageIndex = completedRequest?.source === 'dataset' ? completedRequest.index : null;
    const isReady = await initProcessInfo(requestedJsonImageIndex);
    resetImageRequestState();
    outputMessage(isReady ? 'Load Pic Successfully.' : 'Image loaded, but no matching JSON data was found.');
  } else {
    const failedPath = (response.path || '').replace(/[\\/]/g, '/');
    handleImageRequestFailure(response.error, failedPath);
  }
}

function resetImageForDatasetChange(picTotalNum = 0) {
  imageObj.value = null;
  imgFileName.value = '';
  imgFilePath = '';
  imageLoadErrorPath.value = '';
  resetImageRequestState();
  picInfo.picNum = 0;
  picInfo.picTotalNum = picTotalNum;
  jumpImageIndex.value = '';
  clearDots();
  imgContainerRef.value.clearImage();
  imgContainerRef.value.changeMouseState(true);
  imgContainerRef.value.resetIsImgFileLoading(false);
  jsonView.value.initJsonInfo('');
}

function chooseJsonFile() {
  if (isImageRequestInProgress.value) {
    outputMessage('Please wait for the current image to finish loading.');
    return;
  }
  try {
    ipcRenderer.send('open-json-file-dialog');
  } catch (error) {
    console.error('Error while sending IPC message open-json-file-dialog:', error);
  }
}

// Dataset loading
async function handleChooseJsonFileResponse(_event, response) {
  try {
    if (response.success) {
      const jsonData = response.jsonInfo;
      jsonData.path = jsonData.path.replace(/[\\/]/g, '/');
      const preparedJson = prepareJsonProcess(jsonData);
      if (!preparedJson.success) {
        outputMessage(`Failed to load JSON: ${preparedJson.error}`);
        return;
      }

      const resolvedPathResult = await ipcRenderer.invoke('resolve-json-image-paths', {
        jsonFilePath: preparedJson.path,
        imagePaths: preparedJson.imagePaths,
      });
      if (!resolvedPathResult.success) {
        outputMessage(`Failed to resolve JSON image paths: ${resolvedPathResult.error}`);
        return;
      }
      preparedJson.imagePaths = resolvedPathResult.imagePaths.map(imagePath => imagePath.replace(/[\\/]/g, '/'));

      if (preparedJson.changed) {
        if (isSaving.value) {
          outputMessage('Failed to load JSON: another save operation is still in progress.');
          return;
        }

        isSaving.value = true;
        try {
          if (!(await saveJsonFileInfo(preparedJson.fileInfo))) return;
        } finally {
          isSaving.value = false;
        }
      }

      if (!commitPreparedJsonProcess(preparedJson)) {
        outputMessage('Failed to load JSON: unable to commit the prepared dataset.');
        return;
      }

      loadedProductType.value = preparedJson.productType;
      jsonFileName.value = jsonData.fileName;
      canOperate.value = false;
      resetImageForDatasetChange(preparedJson.data.Picture.length);
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
      const errorMessage = response.error;
      console.error('Failed to read JSON file:', errorMessage);
      outputMessage(`Failed to read JSON file: ${errorMessage}`);
    }
  } catch (error) {
    console.error('An error occurred while processing JSON file:', error);
    outputMessage(`Failed to process JSON file: ${error.message}`);
  }
}

function updateDotsRealCoord(newDotsRealCoord) {
  dotsRealCoord.splice(0, dotsRealCoord.length, ...newDotsRealCoord);
}

watch(dotsRealCoord, () => {
  updateZoomView();
});

// Zoom preview
function updateZoomView() {
  const origin = imgContainerRef.value?.realDot2GetZoom;
  if (!imageObj.value?.complete || !origin || origin.x === -1) return;

  try {
    drawZoomPreview(zoomView.value, imageObj.value, origin, dotsRealCoord);
  } catch (error) {
    console.error('Failed to draw the zoom preview:', error);
  }
}

// Show quad
function toggleHighlight2ShowQuads() {
  imgContainerRef.value.toggleShowQuadIndex(quadInfo.quadNum - 1);
}
function addAll2ShowQuads() {
  for (let i = 0; i < quadInfo.quadTotal; ++i) {
    imgContainerRef.value.addShowQuadIndex(i);
  }
}

function clearShowQuads() {
  imgContainerRef.value.clearShowQuadIndex();
}

function toggleMode() {
  imgContainerRef.value.toggleMode();
}

function updateJsonHighlightIndex(newIndex) {
  jsonView.value.updateHighlightedIndex(newIndex);
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
/* //#ff5f5f; */
.button-delete-style {
  background-color: #4caf50; /* 设置按钮的背景颜色 */
  color: white; /* 设置按钮文字的颜色 */
  border: none; /* 移除按钮的边框 */
  border-radius: 5px; /* 设置按钮的边框圆角 */
  padding: 5px 5px; /* 设置按钮的内边距 */
  cursor: pointer; /* 设置鼠标样式为手型 */
  transition: background-color 0.3s ease; /* 添加过渡效果 */
  width: 20px; /* 设置按钮的宽度为 30 像素 */
  height: 20px; /* 设置按钮的高度为 30 像素 */
  line-height: 5px; /* 设置文字的行高等于按钮的高度，实现文字的垂直居中 */
}
.button-delete-style:hover {
  background-color: #ff3333; /* 设置按钮的背景颜色悬停时的颜色 */
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

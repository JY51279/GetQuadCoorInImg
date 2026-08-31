<template>
  <div class="container">
    <imageItem
      ref="imgContainerRef"
      :image-obj="imageObj"
      :can-edit="canOperate"
      :image-load-error-path="imageLoadErrorPath"
      @update-zoom-view="updateZoomView"
      @output-message="outputMessage"
      @update-dots-real-coord="updateDotsRealCoord"
      @update-json-highlight-index="updateJsonHighlightIndex"
    ></imageItem>
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
          <div class="fileInfo-style">矩形次序: <br />{{ quadInfo.quadNum }} / {{ quadInfo.quadTotal }}</div>
        </div>
        <div class="dotsArea-style">
          <div v-for="(item, index) in dotsRealCoord" :key="index" class="dots">
            <span>({{ item.x }}, {{ item.y }})</span>
            <!-- <button class="button-delete-style" @click="clearOneDot(index)">x</button>-->
          </div>
        </div>
      </div>

      <!-- 输出区域 -->
      <div ref="output" class="outputText-style">
        <div v-for="(message, index) in outputMessages" :key="index">{{ message }}</div>
      </div>

      <div style="display: flex; justify-content: flex-end">
        <Help />
      </div>
      <div class="button-group">
        <button class="button-style" :disabled="isImageRequestInProgress" @click="chooseJsonFile">Get JsonFile</button>
        <button class="button-style" :disabled="isImageRequestInProgress" @click="chooseImgFile">Get PicFile</button>
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

    <jsonItems ref="jsonView" @update-quad-info="updateQuadInfo" @init-show-quads="initShowQuads"></jsonItems>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue';
import jsonItems from './JsonView.vue';
import imageItem from './ImageView.vue';
import Help from './Help.vue';
import {
  prepareJsonProcess,
  commitPreparedJsonProcess,
  getAdjacentJsonImageTarget,
  getJsonImageTarget,
  updateQuadIndex,
  updateJson,
  getJsonPicNum,
  getJsonFileInfo,
  getJsonPerPicPointsArray,
  resetJsonNoValue,
} from '../utils/JsonProcess.js';
import { KEYS } from '../utils/BasicFuncs.js';

const ipcRenderer = window.electron.ipcRenderer;
const imgContainerRef = ref(null);
const jsonView = ref(null);

const quadInfo = reactive({ quadNum: 0, quadTotal: 0 });
function updateQuadInfo(quadNum = -1, quadTotal = -1) {
  if (quadNum !== -1) quadInfo.quadNum = quadNum;
  if (quadTotal !== -1) quadInfo.quadTotal = quadTotal;
}
watch(quadInfo, newQuadInfo => {
  updateQuadIndex(newQuadInfo.quadNum - 1);
  imgContainerRef.value.resetHighlightQuadIndex(newQuadInfo.quadNum - 1);
});

const picInfo = reactive({ picNum: 0, picTotalNum: 0 });
const mouseCoord = { x: 0, y: 0 };
const output = ref(null);
onMounted(() => {
  console.log('onMounted...');
  initZoomSettings();
  window.addEventListener('mousemove', e => {
    mouseCoord.x = e.clientX;
    mouseCoord.y = e.clientY;
  });
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  const outputDiv = output.value;
  outputDiv.scrollTop = outputDiv.scrollHeight;
});

onUnmounted(() => {
  console.log('onUnmounted...');
  window.removeEventListener('mousemove', e => {
    mouseCoord.x = e.clientX;
    mouseCoord.y = e.clientY;
  });
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
});

// 监听键盘事件
let isLogging = false;
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
  const keyCode = e.keyCode || e.code;

  if (!isLogging && keyCode >= 48 && keyCode <= 57) {
    const digit = keyCode - 48;
    clearOneDot(digit - 1);
    return;
  }
  //console.log(e.key);
  const action = keyActions[e.key];
  //console.log(keyActions[e.key]);
  if (!action) return;

  if (e.ctrlKey && e.shiftKey && action.ctrl_shift) {
    e.preventDefault();
    //console.log(action.ctrl_shift);
    action.ctrl_shift();
  } else if (e.ctrlKey && action.ctrl) {
    e.preventDefault();
    action.ctrl();
  } else if (action.default) {
    e.preventDefault();
    action.default();
  }
}
function handleKeyUp() {
  isLogging = false; // 在键盘释放时重置标志为 false，以便下次可以再次执行日志记录操作
}

// 输出信息到输出区域
const MAX_MESSAGES = 50;
const outputMessages = ref([]);
async function outputMessage(message) {
  outputMessages.value.push(message);

  // 仅保留最新的MAX_MESSAGES条
  if (outputMessages.value.length > MAX_MESSAGES) {
    outputMessages.value.splice(0, 1);
  }

  // 滚动到最底部
  await nextTick();
  const outputDiv = output.value;
  outputDiv.scrollTop = outputDiv.scrollHeight;
}

// Click button
function clearOneDot(index) {
  imgContainerRef.value.deletePt(index);
}

function resetPosition() {
  imgContainerRef.value.resetPosition();
}

function clearDots() {
  imgContainerRef.value.clearDots();
  //outputMessage('clearDots Successfully.');
}

// JSON Operations
const isSaving = ref(false);
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
  outputMessages.value = [];
}

// Init Img
const imageObj = ref(new Image());
const canOperate = ref(false);
const imageLoadErrorPath = ref('');
let imgFilePath = '';
async function initProcessInfo(jsonImageIndex = null) {
  try {
    if (!imageObj.value || imageObj.value.src === '') {
      outputMessage('initProcessInfo Error.');
      canOperate.value = false;
      imgContainerRef.value.resetIsImgFileLoading(false);
      return false;
    } else {
      await imgContainerRef.value.initImgInfo();
      imgContainerRef.value.changeMouseState(false);
    }

    if (!jsonView.value.initJsonInfo(imgFilePath, jsonImageIndex)) {
      canOperate.value = false;
      imgContainerRef.value.resetIsImgFileLoading(false);
      return false;
    }

    const { picNum, picTotalNum } = getJsonPicNum();
    picInfo.picNum = picNum;
    picInfo.picTotalNum = picTotalNum;
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

let initImageScale = 1; // Image scale at first to avoid too large image
function initShowQuads() {
  const newShowQuadArray = getJsonPerPicPointsArray();
  imgContainerRef.value.resetQuadsArray(newShowQuadArray, initImageScale);
  clearShowQuads();
  addAll2ShowQuads();
  updateJsonHighlightIndex(-1);
}
// Get files

let imageSrcTmp = '';
const isImageRequestInProgress = ref(false);
let pendingImageRequest = null;

function chooseImgFile() {
  if (isImageRequestInProgress.value) {
    outputMessage('Please wait for the current image to finish loading.');
    return;
  }
  try {
    imageSrcTmp = '';
    pendingImageRequest = null;
    ipcRenderer.send('open-image-file-dialog');
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

function sendImageFileRequest(path) {
  imageSrcTmp = '';
  ipcRenderer.send('open-pic-file', path);
  outputMessage('Get file response...');
}

function startDatasetImageRequest(target, direction, previousRequest = null) {
  const attemptedIndexes = previousRequest?.attemptedIndexes ?? new Set();
  if (!previousRequest && picInfo.picNum > 0) attemptedIndexes.add(picInfo.picNum - 1);
  attemptedIndexes.add(target.index);

  pendingImageRequest = {
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
  if (pendingImageRequest) return;
  pendingImageRequest = {
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
  const failedRequest = pendingImageRequest;
  if (failedRequest?.source !== 'dataset') return false;

  const nextTarget = getAdjacentJsonImageTarget(failedRequest.direction);
  if (!nextTarget.success || failedRequest.attemptedIndexes.has(nextTarget.index)) return false;

  outputMessage(`Skipping unavailable image and trying JSON item ${nextTarget.index + 1}.`);
  startDatasetImageRequest(nextTarget, failedRequest.direction, failedRequest);
  return true;
}

function finishImageRequest() {
  pendingImageRequest = null;
  imageSrcTmp = '';
  isImageRequestInProgress.value = false;
}

function handleImageRequestFailure(errorMessage, failedPath = '') {
  const failedRequest = pendingImageRequest;
  outputMessage(`Failed to open image${failedPath ? `: ${failedPath}` : ''}.`);
  outputMessage(errorMessage || 'Unknown image loading error.');

  if (retryDatasetImageRequest()) return;

  const canRestorePreviousImage = failedRequest?.previousCanOperate === true;
  if (canRestorePreviousImage) {
    canOperate.value = true;
    imageLoadErrorPath.value = '';
    imgContainerRef.value.changeMouseState(false);
  } else {
    imageObj.value = null;
    imgFileName.value = '';
    imgFilePath = '';
    picInfo.picNum = 0;
    imageLoadErrorPath.value = failedPath;
    imgContainerRef.value.clearDots();
  }
  imgContainerRef.value.resetIsImgFileLoading(false);
  finishImageRequest();
}

// 常量：最大允许的宽高
const MAX_DIMENSION = 3072;
async function reloadImageObj(src) {
  await new Promise((resolve, reject) => {
    // 1) 先加载原图到临时 image
    const originalImg = new Image();
    originalImg.onload = () => {
      const { width, height } = originalImg;
      initImageScale = 1;
      // 2) 如果原图都在MAX_DIMENSION以内，直接使用
      if (width <= MAX_DIMENSION && height <= MAX_DIMENSION) {
        imageObj.value = originalImg;
        return resolve(imageObj.value);
      }

      // 3) 否则需要缩放
      //    计算缩放比例：让宽或高中最大的那个恰好等于MAX_DIMENSION
      initImageScale = MAX_DIMENSION / Math.max(width, height);
      const newWidth = Math.floor(width * initImageScale);
      const newHeight = Math.floor(height * initImageScale);

      // 4) 在临时Canvas里绘制并缩放
      const canvas = document.createElement('canvas');
      canvas.width = newWidth;
      canvas.height = newHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(originalImg, 0, 0, newWidth, newHeight);

      // 5) 将canvas内容转成base64或blob给新的Image
      const resizedDataUrl = canvas.toDataURL('image/png');

      // 6) 用这份缩放后的数据来填充最终的 imageObj
      imageObj.value = new Image();
      imageObj.value.onload = () => {
        resolve(imageObj.value);
      };
      imageObj.value.onerror = reject;

      imageObj.value.src = resizedDataUrl;
    };
    originalImg.onerror = reject;
    originalImg.src = src;
  });
}

let imgFileName = ref(null);
ipcRenderer.on('open-pic-file-response', async (e, response) => {
  ensureManualImageRequest();
  imgContainerRef.value.resetIsImgFileLoading(true);
  imgContainerRef.value.changeMouseState(true);
  if (response.success) {
    imageSrcTmp += response.picInfo.str;
    if (response.picInfo.fileName === '') return;

    const completedRequest = pendingImageRequest;
    try {
      await reloadImageObj(imageSrcTmp);
    } catch (error) {
      handleImageRequestFailure(error.message, response.picInfo.path || completedRequest?.path || '');
      return;
    }

    imgFileName.value = response.picInfo.fileName;
    imgFilePath = response.picInfo.path.replace(/\\/g, '/');
    imageLoadErrorPath.value = '';
    const requestedJsonImageIndex = completedRequest?.source === 'dataset' ? completedRequest.index : null;
    const isReady = await initProcessInfo(requestedJsonImageIndex);
    finishImageRequest();
    outputMessage(isReady ? 'Load Pic Successfully.' : 'Image loaded, but no matching JSON data was found.');
  } else {
    const failedPath = (response.path || '').replace(/[\\/]/g, '/');
    handleImageRequestFailure(response.error, failedPath);
  }
});

function resetImageForDatasetChange(picTotalNum = 0) {
  imageObj.value = null;
  imgFileName.value = '';
  imgFilePath = '';
  imageLoadErrorPath.value = '';
  pendingImageRequest = null;
  isImageRequestInProgress.value = false;
  picInfo.picNum = 0;
  picInfo.picTotalNum = picTotalNum;
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

let jsonFileName = ref(null);
const loadedProductType = ref('');
ipcRenderer.on('choose-json-file-response', async (e, response) => {
  try {
    if (response.success) {
      const jsonData = response.jsonInfo;
      jsonData.path = jsonData.path.replace(/[\\/]/g, '/');
      const preparedJson = prepareJsonProcess(jsonData);
      if (!preparedJson.success) {
        outputMessage(`Failed to load JSON: ${preparedJson.error}`);
        return;
      }

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
      // 处理读取文件失败的情况
      const errorMessage = response.error;
      console.error('Failed to read JSON file:', errorMessage);
      outputMessage(`Failed to read JSON file: ${errorMessage}`);
    }
  } catch (error) {
    console.error('An error occurred while processing JSON file:', error);
    outputMessage(`Failed to process JSON file: ${error.message}`);
  }
});

const dotsRealCoord = reactive([]);
function updateDotsRealCoord(newDotsRealCoord) {
  dotsRealCoord.splice(0, dotsRealCoord.length, ...newDotsRealCoord);
}
// eslint-disable-next-line no-unused-vars
watch(dotsRealCoord, newDotsRealCoord => {
  updateZoomView();
});
// Update Zoom
const zoomView = ref(null);
function updateZoomView() {
  if (!imageObj.value || !imageObj.value.complete) return;
  drawZoomAndDots();
}
function drawZoomAndDots() {
  try {
    if (!imageObj.value || !imageObj.value.complete || imgContainerRef.value.realDot2GetZoom.x === -1) return;
    const zoomCtx = zoomView.value.getContext('2d');
    zoomCtx.drawImage(
      imageObj.value,
      imgContainerRef.value.realDot2GetZoom.x,
      imgContainerRef.value.realDot2GetZoom.y,
      6,
      6,
      0,
      0,
      120,
      120,
    );

    for (let i = 0; i < dotsRealCoord.length; ++i) {
      drawDotInZoom(dotsRealCoord[i]);
    }

    // always highlight center pixel (4th row, 4th col = index 3,3)
    drawMouseQuadInZoom();
  } catch (err) {
    console.log(imageObj.value);
    console.error('An error occurred:', err);
  }
}

function drawDotInZoom(newRealCoord) {
  if (imgContainerRef.value.realDot2GetZoom.x === -1) return;
  const zoomCtx = zoomView.value.getContext('2d');
  let transX = newRealCoord.x - imgContainerRef.value.realDot2GetZoom.x;
  let transY = newRealCoord.y - imgContainerRef.value.realDot2GetZoom.y;
  if (transX >= 0 && transX < 6 && transY >= 0 && transY < 6) {
    zoomCtx.fillRect(transX * 20, transY * 20, 20, 20);
  }
}

function initZoomSettings() {
  const zoomCtx = zoomView.value.getContext('2d');
  zoomCtx.imageSmoothingEnabled = false;
  zoomCtx.mozImageSmoothingEnabled = false;
  zoomCtx.webkitImageSmoothingEnabled = false;
  zoomCtx.msImageSmoothingEnabled = false;
  zoomCtx.fillStyle = 'rgb(255,0,0)'; // 设置颜色
}

// 边界情况很少却要增加很多逻辑，以后有空再改，当前仅考虑4th row, 4th col
function drawMouseQuadInZoom() {
  const zoomCtx = zoomView.value.getContext('2d');
  const px = 60, // 3 * 20,
    py = 60, // 3 * 20,
    size = 20;

  zoomCtx.lineWidth = 2;
  // 外黑框
  zoomCtx.strokeStyle = 'blue';
  zoomCtx.strokeRect(px, py, size, size);

  // 内白十字
  zoomCtx.strokeStyle = 'red';
  zoomCtx.beginPath();
  zoomCtx.moveTo(px + 5, py + 10);
  zoomCtx.lineTo(px + 15, py + 10);
  zoomCtx.moveTo(px + 10, py + 5);
  zoomCtx.lineTo(px + 10, py + 15);
  zoomCtx.stroke();
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
.outputText-style {
  height: 200px;
  font-size: 12px;
  margin-top: auto;
  margin-bottom: 10px;
  word-wrap: break-word;
  overflow-y: scroll;
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
.button-group {
  display: flex;
  flex-direction: column;
  row-gap: 10px;
}
</style>

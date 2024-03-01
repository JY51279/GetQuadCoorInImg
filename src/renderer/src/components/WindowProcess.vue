<template>
  <div class="container">
    <imageItem
      ref="imgContainerRef"
      :image-obj="imageObj"
      @update-zoom-view="updateZoomView"
      @output-message="outputMessage"
      @update-dots-real-coord="updateDotsRealCoord"
    ></imageItem>
    <div class="tool-container">
      <div>
        <div class="zoomViewBox">
          <canvas id="zoom" ref="zoomView" class="zoom-style" width="120" height="120"></canvas>
        </div>
        <div>
          <input v-model="selectedOption" type="checkbox" :value="PRODUCTS.DBR" @click="checkClass" />DBR<br />
          <input v-model="selectedOption" type="checkbox" :value="PRODUCTS.DDN" @click="checkClass" />DDN<br />
          <input v-model="selectedOption" type="checkbox" :value="PRODUCTS.DLR" @click="checkClass" />DLR<br />
        </div>
        <div class="fileArea-style">
          <div class="fileInfo-style">数据集: {{ jsonFileName }}</div>
          <div class="fileInfo-style">图片: {{ imgFileName }}</div>
          <div class="fileInfo-style">图片次序: <br />{{ picInfo.picNum }} / {{ picInfo.picTotalNum }}</div>
          <div class="fileInfo-style">矩形次序: <br />{{ quadInfo.quadNum }} / {{ quadInfo.quadTotal }}</div>
        </div>
        <div class="dotsArea-style">
          <div v-for="(item, index) in dotsRealCoord" :key="index" class="dots">
            <span>({{ item.x }}, {{ item.y }})</span>
            <button class="button-delete-style" @click="clearOneDot(index)">x</button>
          </div>
        </div>
      </div>
      <div>
        <!-- 输出区域 -->
        <div ref="output" class="outputText-style">
          <div v-for="(message, index) in outputMessages" :key="index">{{ message }}</div>
        </div>
      </div>
      <div class="button-group">
        <button class="button-style" @click="chooseJsonFile">Get JsonFile</button>
        <button class="button-style" @click="chooseImgFile">Get PicFile</button>
        <button class="button-style" @click="modifyJsonItem">Mod JsonItem</button>
        <button class="button-style" @click="deleteJsonItem">Del JsonItem</button>
        <button class="button-style" @click="addJsonItem">Add JsonItem</button>
        <!--TODO 目前的布局放不下了才暂时注释了三个不咋重要的！！！
          <button class="button-style" @click="clearDots">Clear Dots</button>
        <button class="button-style" @click="clearMessage">Clear Msgs</button>
        <button class="button-style" @click="resetPosition">Reset Pos</button>
       -->
      </div>
    </div>

    <jsonItems
      ref="jsonView"
      @update-quad-info="updateQuadInfo"
      @update-quad-str-array="updateShowQuadsArray"
      @output-message="outputMessage"
    ></jsonItems>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue';
import jsonItems from './JsonView.vue';
import imageItem from './ImageView.vue';
import {
  resetJsonProcess,
  getAdjacentImagePath,
  updateQuadIndex,
  updateJson,
  getJsonPicNum,
  getJsonFileInfo,
  getJsonPerPicPointsArray,
} from '../utils/JsonProcess.js';
import { KEYS, PRODUCTS } from '../utils/BasicFuncs.js';

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

const picInfo = ref({ picNum: 0, picTotalNum: 0 });

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
    ctrl: () => resetPosition(),
  },
  q: {
    default: () => addHighlight2ShowQuads(),
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

/******click */
// Click checkbox to check the class
const selectedOption = ref(['DBR']);
const classTotalStr = ['DBR', 'DDN', 'DLR'];
function checkClass() {
  setTimeout(function () {
    if (selectedOption.value.length === 0) {
      selectedOption.value.push(classTotalStr[0]);
    }
    if (selectedOption.value.length > 1) {
      selectedOption.value.splice(0, 1);
    }
  }, 1);
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
function performJsonAction(action) {
  outputMessage('Start operate: ' + action);
  let updateJsonRes = updateJson(action);
  if (updateJsonRes !== KEYS.OPERATE_SUCCESS) {
    outputMessage(updateJsonRes);
    return;
  }
  saveJsonFile();
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
}

function addJsonItem() {
  if (selectedOption.value[0] !== PRODUCTS.DDN) {
    outputMessage("Can't add JSON item, the class is not 'DDN'.");
    return;
  }
  performJsonAction(KEYS.JSON_ADD);
}

function deleteJsonItem() {
  performJsonAction(KEYS.JSON_DELETE);
}

function modifyJsonItem() {
  performJsonAction(KEYS.JSON_MODIFY);
}

function saveJsonFile() {
  try {
    let jsonFileInfo = { str: '', path: '' };
    jsonFileInfo = getJsonFileInfo();
    ipcRenderer.send('save-json-file', jsonFileInfo);
  } catch (error) {
    console.error('Error while sending IPC message:', error);
  }
}

ipcRenderer.on('save-json-file-response', (event, response) => {
  try {
    if (response.success) {
      outputMessage('Json saved.');
    } else {
      const errorMessage = response.error;
      console.error('Failed to save JSON file:', errorMessage);
    }
  } catch (error) {
    console.error('An error occurred while saving JSON file:', error);
    console.log(response);
  }
});

function clearMessage() {
  outputMessages.value = [];
}

// Init Img
const imageObj = ref(new Image());
const imageSrc = ref('');
let imgFilePath = '';
function initProcessInfo(direction = '') {
  if (imageObj.value === null || imageObj.value.src === '') {
    outputMessage('initProcessInfo Error.');
    return;
  }
  imgContainerRef.value.initImgInfo();
  jsonView.value.initJsonInfo(imgFilePath, direction);
  picInfo.value = getJsonPicNum();
  initShowQuads();
  openImgFileDirection = '';
}

function initShowQuads() {
  console.log('quadInfo: ', quadInfo.quadTotal);
  clearShowQuads();
  addAll2ShowQuads();
}
// Get files

let imageSrcTmp = '';
function chooseImgFile() {
  try {
    imageSrcTmp = '';
    ipcRenderer.send('open-image-file-dialog');
  } catch (error) {
    console.error('Error while sending IPC message open-image-file-dialog:', error);
  }
}

let openImgFileDirection = '';
function changeImageByArrowKeys(direction) {
  const path = getAdjacentImagePath(direction);
  openImgFileDirection = direction;
  loadImgFromPath(path);
}

function loadImgFromPath(path) {
  //console.log(path);
  imageSrcTmp = '';
  ipcRenderer.send('open-pic-file', path);
}

let imgFileName = ref(null);
ipcRenderer.on('open-pic-file-response', async (e, response) => {
  try {
    if (response.success) {
      imageSrcTmp += response.picInfo.str;
      if (response.picInfo.fileName === '') return;

      outputMessage('Load Pic......');
      imgContainerRef.value.changeMouseState(true);
      await new Promise((resolve, reject) => {
        imageObj.value = new Image();
        imageObj.value.onload = () => resolve(imageObj.value);
        imageObj.value.onerror = reject;
        imageObj.value.src = imageSrcTmp;
      });
      imgContainerRef.value.changeMouseState(false);

      imgFileName.value = response.picInfo.fileName;
      imgFilePath = response.picInfo.path;
      imageSrc.value = imageSrcTmp;
      initProcessInfo(openImgFileDirection);
    } else {
      // 处理读取文件失败的情况
      const errorMessage = response.error;
      console.error('Failed to open pic:', errorMessage);
    }
  } catch (error) {
    console.error('An error occurred while processing pic file:', error);
    console.log(response);
  }
});

function chooseJsonFile() {
  try {
    ipcRenderer.send('open-json-file-dialog');
  } catch (error) {
    console.error('Error while sending IPC message open-json-file-dialog:', error);
  }
}

let jsonFileName = ref(null);
ipcRenderer.on('choose-json-file-response', (e, response) => {
  try {
    if (response.success) {
      let jsonData = { str: '', path: '', fileName: '' };
      jsonData = response.jsonInfo;
      jsonFileName.value = jsonData.fileName;
      resetJsonProcess(jsonData, selectedOption.value[0]);
      if (imgFilePath !== '') initProcessInfo();
      outputMessage('JSON data input successful.');
    } else {
      // 处理读取文件失败的情况
      const errorMessage = response.error;
      console.error('Failed to read JSON file:', errorMessage);
    }
  } catch (error) {
    console.error('An error occurred while processing JSON file:', error);
    console.log(response);
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

// Show quad
function addHighlight2ShowQuads() {
  imgContainerRef.value.addShowQuadIndex(quadInfo.quadNum - 1);
}
function addAll2ShowQuads() {
  for (let i = 0; i < quadInfo.quadTotal; ++i) {
    imgContainerRef.value.addShowQuadIndex(i);
  }
}

function clearShowQuads() {
  imgContainerRef.value.clearShowQuadIndex();
}

function updateShowQuadsArray() {
  const newShowQuadArray = getJsonPerPicPointsArray();
  imgContainerRef.value.resetQuadsArray(newShowQuadArray);
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
  font-size: 15px;
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

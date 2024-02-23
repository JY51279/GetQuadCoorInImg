<template>
  <input ref="imgFileInput" type="file" accept="image/*" style="display: none" @change="loadImgFile" />
  <div class="container">
    <div class="image-container" ref="divRef" @wheel="onWheel">
      <canvas
        ref="canvas"
        :width="viewportWidth + offsetCanvasLeft"
        :height="viewportHeight + offsetCanvasTop"
        :style="`transform: translate(${-offsetCanvasLeft}px, ${-offsetCanvasTop}px);
                transform-origin: 0% 0%;`"
        @click="toggleDot"
        @mousemove="updateZoomView"
      ></canvas>
      <div
        v-for="dot in dotsCanvasCoor"
        :key="dot.id"
        class="dot"
        :style="`
              transform: translate(${-offsetCanvasLeft}px, ${-offsetCanvasTop}px) scale(${scale});
              transform-origin: 0% 0%;
              top: ${dot.y}px;
              left: ${dot.x}px;
              z-index: 9998;
            `"
        @click="deleteDot"
      ></div>
      <div
        v-if="scale < gridLimit"
        class="rectangle"
        :style="`
              transform: translate(${-offsetCanvasLeft}px, ${-offsetCanvasTop}px) scale(${scale});
              transform-origin: 0% 0%;
              z-index: 9998;
            `"
      ></div>
    </div>
    <div
      class="scale"
      style="display: flex; position: fixed; left: 40px; bottom: 25px; width: calc(50%); z-index: 9999"
    >
      <input
        v-if="imageSrc"
        v-model.number="scale"
        type="number"
        min="0.1"
        :max="scaleRange"
        step="0.1"
        style="width: 60px"
      />
      <input
        v-if="imageSrc"
        v-model.number="scale"
        type="range"
        min="1"
        :max="scaleRange"
        step="1"
        style="width: calc(100%)"
      />
    </div>
    <div class="tool-container">
      <div>
        <div class="zoomViewBox">
          <canvas id="zoom" ref="zoomView" class="zoom-style" width="120" height="120"></canvas>
        </div>
        <div>
          <input v-model="selectedOption" type="checkbox" value="DBR" @click="checkClass" />DBR<br />
          <input v-model="selectedOption" type="checkbox" value="DDN" @click="checkClass" />DDN<br />
          <input v-model="selectedOption" type="checkbox" value="DLR" @click="checkClass" />DLR<br />
        </div>
        <div class="fileInfo-style">数据集: {{ jsonFileName }}</div>
        <div class="fileInfo-style">图片: {{ imgFileName }}</div>
        <div v-for="(item, index) in dotsRealCoor" :key="index">
          <span>({{ item.x }}, {{ item.y }})</span>
          <button class="button-delete-style" @click="clearOneDot(index)">x</button>
        </div>
        <div class="fileInfo-style">矩形对应次序: {{ outputQuadNumber }}</div>
        <input class="inputText-style" :value="inputQuadNum" placeholder="矩形次序修正" @input="getInputQuadNum" />
      </div>
      <div>
        <!-- 输出区域 -->
        <div ref="output" class="outputText-style" style="overflow-y: scroll; height: 200px">
          <div v-for="(message, index) in outputMessages" :key="index">{{ message }}</div>
        </div>
      </div>
      <div class="button-group">
        <button class="button-style" @click="chooseJsonFile">Get JsonFile</button>
        <button class="button-style" @click="chooseImgFile">Get PicFile</button>
        <button class="button-style" @click="saveDots">Save Dots</button>
        <button class="button-style" @click="clearDots">Clear Dots</button>
        <button class="button-style" @click="clearMessage">Clear Msgs</button>
        <button class="button-style" @click="resetPosition">Reset Position</button>
      </div>
    </div>
    <div class="json-container">
      <pre ref="jsonView" @mousemove="highlightLine">{{ formattedJsonStr }}</pre>
      <div class="highlighted-line" v-if="highlightedLine !== null">
        Current JSON content of the highlighted line: {{ getCurrentJsonContent() }}
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useMouse, useMousePressed } from '@vueuse/core';
import cloneDeep from 'lodash/cloneDeep';
import {
  resetJsonProcess,
  setQuadInfo,
  updateQuadIndex,
  updateJson,
  getJsonPerPicFormatted,
} from '../utils/JsonProcess.js';

const ipcRenderer = window.electron.ipcRenderer;
const offsetCanvasLeft = 22;
const offsetCanvasTop = 22;
const divRef = ref(null);
const canvas = ref(null);
const scale = ref(1);

const formattedJsonStr = ref('');
const highlightedLine = ref(null);
const currentJsonContent = ref({});

let formattedJson = {};
function updateFormattedJson() {
  formattedJsonStr.value = getJsonPerPicFormatted();
  formattedJson = JSON.parse(formattedJsonStr.value);
}

function highlightLine(e) {
  const preElement = e.target;
  const lineHeight = preElement.clientHeight / preElement.scrollHeight;
  const hoveredLine = Math.floor(e.offsetY / (preElement.scrollHeight * lineHeight));
  highlightedLine.value = hoveredLine + 1;

  // 获取当前行的 JSON 内容
  //console.log(formattedJson);
  currentJsonContent.value = getCurrentJsonContent(formattedJson, hoveredLine);
}

// 根据行号获取当前行的 JSON 内容
function getCurrentJsonContent(data, lineNumber) {
  console.log('getCurrentJsonContent');
  console.log(data);
  console.log('lineNumber: ' + lineNumber);
  if (Array.isArray(data)) {
    console.log('isArray');
    console.log(data[lineNumber]);
    return data[lineNumber];
  } else if (typeof data === 'object') {
    console.log('isObject');
    const keys = Object.keys(data);
    console.log(keys);
    return data[keys[lineNumber]];
  }
  return 'Faild Get Current Json';
}

// Basic delete
function deletePt(ptIndex) {
  if (ptIndex !== -1 && ptIndex < dotsCanvasCoor.value.length) {
    dotsCanvasCoor.value.splice(ptIndex, 1);
    dotsRealCoor.value.splice(ptIndex, 1);
    calcQuadNum.value = 0;
    updateQuadNum();
    drawZoomAnddots();
    return true;
  }
  return false;
}

// Delete Dot in canvas
function deleteDot(e) {
  const { existingDotIndex } = getDotInfo(e);
  if (!deletePt(existingDotIndex)) {
    outputMessage('Error delete the pt in canvas!');
  }
}

function getDotInfo(e) {
  let canvasCoor = {
    x: e.clientX,
    y: e.clientY,
  };
  let realCoor = { x: 0, y: 0 };

  transCanvas2RealInfo(realCoor, canvasCoor); // 得到原始图片对应坐标
  transReal2CanvasInfo(canvasCoor, realCoor); // 得到贴合后画布确切坐标

  const existingDotIndex = dotsRealCoor.value.findIndex(
    realDot => Math.abs(realDot.x - realCoor.x) < 2 && Math.abs(realDot.y - realCoor.y) < 2,
  );
  // console.log('***********getDotInfo');
  // console.log('e.client: (' + e.clientX + ', ' + e.clientY + ')');
  // console.log('canvasCoor: (' + canvasCoor.x + ', ' + canvasCoor.y + ')');
  // console.log('realCoor: (' + realCoor.x + ', ' + realCoor.y + ')');
  return { canvasCoor, realCoor, existingDotIndex };
}

let imgPixelData2D = [];
function updataImgData() {
  // 创建一个Canvas对象
  let canvasTmp = document.createElement('canvas');
  canvasTmp.width = initImgWidth.value;
  canvasTmp.height = initImgHeight.value;

  // 将图像绘制到Canvas上
  var ctxTmp = canvasTmp.getContext('2d');
  ctxTmp.drawImage(imageObj.value, 0, 0);

  // 获取图像像素的颜色矩阵
  const imgPixelData = ctxTmp.getImageData(0, 0, canvasTmp.width, canvasTmp.height).data;
  const imgPixelData2DTmp = [];
  for (let x = 0; x < canvasTmp.width; ++x) {
    imgPixelData2DTmp[x] = [];
    for (let y = 0; y < canvasTmp.height; ++y) {
      const i = (y * canvasTmp.width + x) * 4;
      const r = imgPixelData[i];
      const g = imgPixelData[i + 1];
      const b = imgPixelData[i + 2];
      const a = imgPixelData[i + 3];
      const cssColor = `rgba(${r}, ${g}, ${b}, ${a})`;
      imgPixelData2DTmp[x][y] = cssColor;
    }
  }
  imgPixelData2D = imgPixelData2DTmp;
}

// Only draw the part of img inside the viewport
const canvasLTCoor = { x: 0, y: 0 };
const canvasRBCoor = { x: 0, y: 0 };
const sourceLTCoor = { x: 0, y: 0 };
const sourceRBCoor = { x: 0, y: 0 };
const gridLimit = 10;
function drawCanvas() {
  if (canvas.value === null || canvas.value === null) {
    outputMessage('drawCanvas canvas Error.');
    return;
  }
  if (
    offsetX.value >= viewportWidth.value ||
    offsetY.value >= viewportHeight.value ||
    offsetX.value <= -initImgWidth.value * scale.value ||
    offsetY.value <= -initImgHeight.value * scale.value
  ) {
    console.log('offset: (' + offsetX.value + ', ' + offsetY.value + ')');
    console.log('maxOff: (' + viewportWidth.value + ', ' + viewportHeight.value + ')');
    console.log('minOff: (' + -initImgWidth.value * scale.value + ', ' + -initImgHeight.value * scale.value + ')');
    console.log('scale: ' + scale.value);
    outputMessage('drawCanvas offset Error.');
    return;
  }

  // Calc Overlap area
  const x1 = Math.max(0, offsetX.value);
  const x2 = Math.min(viewportWidth.value - 1, offsetX.value + initImgWidth.value * scale.value - 1);
  const y1 = Math.max(0, offsetY.value);
  const y2 = Math.min(viewportHeight.value - 1, offsetY.value + initImgHeight.value * scale.value - 1);
  let imgScaledLTCoor = { x: x1 - offsetX.value, y: y1 - offsetY.value };
  let imgScaledRBCoor = { x: x2 - offsetX.value, y: y2 - offsetY.value };

  //Calc letf-top and right-bottom pts in canvas
  transScaled2RealInfo(sourceLTCoor, imgScaledLTCoor);
  transScaled2RealInfo(sourceRBCoor, imgScaledRBCoor);

  transReal2ScaledInfo(imgScaledLTCoor, sourceLTCoor); // 使点位置与图片像素贴合
  transReal2ScaledInfo(imgScaledRBCoor, {
    x: sourceRBCoor.x + 1,
    y: sourceRBCoor.y + 1,
  }); //得到目标范围外的右下一点，用以后续计算dw dh

  const sw = Math.abs(sourceLTCoor.x - sourceRBCoor.x) + 1;
  const sh = Math.abs(sourceLTCoor.y - sourceRBCoor.y) + 1;
  const dw = Math.abs(imgScaledRBCoor.x - imgScaledLTCoor.x);
  const dh = Math.abs(imgScaledRBCoor.y - imgScaledLTCoor.y);

  transScaled2CanvasInfo(canvasLTCoor, imgScaledLTCoor);
  transScaled2CanvasInfo(canvasRBCoor, imgScaledRBCoor);

  //Draw
  ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height);
  if (scale.value < gridLimit) {
    initCanvasSettings();
    ctx.value.drawImage(imageObj.value, sourceLTCoor.x, sourceLTCoor.y, sw, sh, canvasLTCoor.x, canvasLTCoor.y, dw, dh);
  } else {
    drawGrid();
    drawImgInGrid(sw, sh);
  }
}

// Area: [canvasLTCoor, canvasRBCoor)
function drawGrid() {
  // 设置间隔
  const space = scale.value + 1;
  // 区域的左上和右下
  const areaX1 = canvasLTCoor.x,
    areaX2 = Math.min(canvasRBCoor.x, canvas.value.width);
  const areaY1 = canvasLTCoor.y,
    areaY2 = Math.min(canvasRBCoor.y, canvas.value.height);
  // 设置虚线
  ctx.value.setLineDash([]);

  // 绘制水平方向的网格线
  for (let y = areaY1; y <= areaY2; y += space) {
    ctx.value.beginPath();
    ctx.value.moveTo(areaX1, y);
    ctx.value.lineTo(areaX2, y);
    ctx.value.stroke();
  }

  // 绘制垂直方向的网格线
  for (let x = areaX1; x <= areaX2; x += space) {
    ctx.value.beginPath();
    ctx.value.moveTo(x, areaY1);
    ctx.value.lineTo(x, areaY2);
    ctx.value.stroke();
  }
}

function drawImgInGrid(sourceWidth, sourceHeight) {
  const space = scale.value + 1;
  const dw = scale.value,
    dh = scale.value;
  const startX = canvasLTCoor.x + 1,
    startY = canvasLTCoor.y + 1; // 包括最左/上侧网格线
  for (let shOffset = 0; shOffset < sourceHeight; ++shOffset) {
    const canvasY = startY + shOffset * space;
    const sourceY = sourceLTCoor.y + shOffset;
    for (let swOffset = 0; swOffset < sourceWidth; ++swOffset) {
      const canvasX = startX + swOffset * space;
      const sourceX = sourceLTCoor.x + swOffset;

      ctx.value.fillStyle = imgPixelData2D[sourceX][sourceY];
      ctx.value.fillRect(canvasX, canvasY, dw, dh);
    }
  }
}

function drawZoomAnddots() {
  if (realDot2GetZoom.value.x === -1) return;
  const zoomctx = zoomView.value.getContext('2d');
  zoomctx.drawImage(imageObj.value, realDot2GetZoom.value.x, realDot2GetZoom.value.y, 6, 6, 0, 0, 120, 120);

  for (let i = 0; i < dotsRealCoor.value.length; ++i) {
    drawDotInZoom(dotsRealCoor.value[i]);
  }
}

function drawDotInZoom(newRealCoor) {
  if (realDot2GetZoom.value.x === -1) return;
  const zoomctx = zoomView.value.getContext('2d');
  let transX = newRealCoor.x - realDot2GetZoom.value.x;
  let transY = newRealCoor.y - realDot2GetZoom.value.y;
  if (transX >= 0 && transX < 6 && transY >= 0 && transY < 6) {
    zoomctx.fillRect(transX * 20, transY * 20, 20, 20);
  }
}

function updateViewPortDraw() {
  if (imageSrc.value === null || imageSrc.value === '') return;
  drawCanvas();
  updateDotsCanvasCoor();
}

// Move
const autoAdaptBorderDis = 10;
const offsetX = ref(0);
const offsetY = ref(0);
const { x, y } = useMouse();
const { pressed } = useMousePressed({ target: divRef });
watch([x, y], ([newX, newY], [oldX, oldY]) => {
  if (pressed.value) {
    //console.log(`Mouse moved from (${oldX}, ${oldY}) to (${newX}, ${newY})`);
    const deltaX = newX - oldX;
    const deltaY = newY - oldY;
    if (deltaX === 0 && deltaY === 0) return;

    offsetX.value += deltaX;
    offsetY.value += deltaY;

    // auto Adapt Border
    if (!(imageSrc.value === null || imageSrc.value === '')) {
      if (Math.abs(newX) < Math.abs(oldX)) {
        if (Math.abs(offsetX.value) < autoAdaptBorderDis) offsetX.value = 0;
      } else if (Math.abs(newX) > Math.abs(oldX)) {
        if (Math.abs(offsetX.value + initImgWidth.value * scale.value - viewportWidth.value) < autoAdaptBorderDis)
          offsetX.value = viewportWidth.value - initImgWidth.value * scale.value;
      }

      if (Math.abs(newY) < Math.abs(oldY)) {
        if (Math.abs(offsetY.value) < autoAdaptBorderDis) offsetY.value = 0;
      } else if (Math.abs(newY) > Math.abs(oldY)) {
        if (Math.abs(offsetY.value + initImgHeight.value * scale.value - viewportHeight.value) < autoAdaptBorderDis)
          offsetY.value = viewportHeight.value - initImgHeight.value * scale.value;
      }
    }
    updateViewPortDraw();
  }
});

// Scale
function updateOffset(oldScale, newScale) {
  if (oldScale < 1 || newScale < 1) return;

  // Judge: Mouse in rendered area
  let canvasCoor = cloneDeep(mouseCoor);
  let realCoor = { x: 0, y: 0 };
  transCanvas2RealInfo(realCoor, canvasCoor, oldScale);
  if (
    realCoor.x < sourceLTCoor.x ||
    realCoor.x > sourceRBCoor.x ||
    realCoor.y < sourceLTCoor.y ||
    realCoor.y > sourceRBCoor.y
  )
    return;

  // purpose：Scale the image based on the mouseCoor
  // Calc fineTuning
  transReal2CanvasInfo(canvasCoor, realCoor, oldScale);
  const offsetPixels = {
    x: mouseCoor.x - canvasCoor.x,
    y: mouseCoor.y - canvasCoor.y,
  };
  const fineTuning = {
    x: Math.floor((offsetPixels.x / oldScale) * newScale),
    y: Math.floor((offsetPixels.y / oldScale) * newScale),
  };

  // Calc scaled canvasCoor without updating offset
  transReal2CanvasInfo(canvasCoor, realCoor, newScale);

  offsetX.value -= canvasCoor.x + fineTuning.x - mouseCoor.x;
  offsetY.value -= canvasCoor.y + fineTuning.y - mouseCoor.y;
}

watch(scale, (newScale, oldScale) => {
  //console.log('scale:', newScale);
  if (newScale === 0) return;
  else updateOffset(oldScale, newScale);
  updateViewPortDraw();
});

// Judge click type
let mouseMoved = false;
let timer = null;
let isNotLongPress = true;
watch(pressed, newVal => {
  if (newVal) {
    isNotLongPress = true;
    mouseMoved = false; // 重置鼠标移动状态
    timer = setTimeout(() => {
      isNotLongPress = false;
    }, 150); // 长按时间阈值
  } else {
    clearTimeout(timer);
    if (isNotLongPress && !mouseMoved) {
      // 如果鼠标没有移动
      isNotLongPress = true;
    } else {
      isNotLongPress = false;
    }
  }
});

const mouseCoor = { x: 0, y: 0 };
const output = ref(null);
onMounted(() => {
  console.log('onMounted...');
  initZoomSettings();
  updateViewSize();
  window.addEventListener('resize', updateViewSize);
  window.addEventListener('mousemove', e => {
    mouseCoor.x = e.clientX;
    mouseCoor.y = e.clientY;
    mouseMoved = true;
  });

  const outputDiv = output.value;
  outputDiv.scrollTop = outputDiv.scrollHeight;
});

onUnmounted(() => {
  console.log('onUnmounted...');
  window.removeEventListener('resize', updateViewSize);
  window.removeEventListener('mousemove', e => {
    mouseCoor.x = e.clientX;
    mouseCoor.y = e.clientY;
    mouseMoved = true;
  });
});

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

// Input
const inputQuadNum = ref('');
const calcQuadNum = ref(0);
const outputQuadNumber = ref(0);
function updateQuadNum() {
  if (inputQuadNum.value === '') outputQuadNumber.value = calcQuadNum.value;
  else outputQuadNumber.value = inputQuadNum.value;
  updateQuadIndex(dotsRealCoor.value, outputQuadNumber.value);
}

function getInputQuadNum(e) {
  inputQuadNum.value = e.target.value;
  updateQuadNum();
}

/******click */
// Click checkbox to check the class
const selectedOption = ref(['DBR']);
const classTotalStr = ['DBR', 'DDN', 'DLR'];
function checkClass(e) {
  setTimeout(function () {
    if (selectedOption.value.length === 0) {
      selectedOption.value.push(classTotalStr[0]);
    }
    if (selectedOption.value.length > 1) {
      selectedOption.value.splice(0, 1);
    }
  }, 1);
}

// Click button to del dot
function clearOneDot(index) {
  deletePt(index);
}

// Click canvas to get dot
const dotsCanvasCoor = ref([]);
const dotsRealCoor = ref([]);
function toggleDot(e) {
  if (imageSrc.value == null || imageSrc.value == '' || !isNotLongPress) {
    return;
  }
  // 如果红点在图片显示范围外，输出“The pt is not in the pic.”
  if (
    e.clientX < canvasLTCoor.x ||
    e.clientX >= canvasRBCoor.x ||
    e.clientY < canvasLTCoor.y ||
    e.clientY >= canvasRBCoor.y
  ) {
    outputMessage('The pt is not in the pic.');
    return;
  }

  const { canvasCoor, realCoor, existingDotIndex } = getDotInfo(e);
  if (existingDotIndex !== -1) {
    // 如果已经存在红点，删除它
    deletePt(existingDotIndex);
    outputMessage('Delete the pt.');
  } else if (dotsCanvasCoor.value.length >= 4) {
    // 如果已经有四个红点，输出“Already set 4 pts.”
    outputMessage('Already set 4 pts.');
  } else {
    // 否则，添加一个新的红点
    dotsRealCoor.value.push({ x: realCoor.x, y: realCoor.y });
    updateDotsCanvasCoor();
    drawDotInZoom(realCoor);
    if (dotsRealCoor.value.length === 4) {
      setQuadInfo(dotsRealCoor.value, calcQuadNum);
    } else {
      calcQuadNum.value = 0;
    }
    updateQuadNum();
  }
}

function resetPosition() {
  offsetX.value = 0;
  offsetY.value = 0;
  updateViewPortDraw();
}

function clearDots() {
  dotsCanvasCoor.value = [];
  dotsRealCoor.value = [];
  calcQuadNum.value = 0;
  updateQuadNum();
  //outputMessage('cleardots Successfully.');
}

function saveDots() {
  let updateJsonRes = updateJson(jsonData);
  if (updateJsonRes !== true) {
    outputMessage(updateJsonRes);
    return;
  }
  saveJsonFile(jsonData);
}

function saveJsonFile(jsonData) {
  try {
    ipcRenderer.send('save-json-file', jsonData);
  } catch (error) {
    console.error('Error while sending IPC message:', error);
  }
}

ipcRenderer.on('save-json-file-response', (event, response) => {
  try {
    if (response.success) {
      outputMessage('JSON data output successful.');
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
const initImgWidth = ref(0);
const initImgHeight = ref(0);
const imageObj = ref(null);
const imageSrc = ref('');
const ctx = ref(null);
function initDrawImg() {
  if (imageSrc.value === '' || imageSrc.value === null) {
    outputMessage('initDrawImg Error.');
    return;
  }
  scale.value = 0;
  offsetX.value = 0;
  offsetY.value = 0;
  clearDots();
  resetJsonProcess(jsonData.str, selectedOption.value[0], imgFileName.value);
  updateFormattedJson();
  const img = new Image();
  img.src = imageSrc.value;
  img.onload = () => {
    // Update imgInfo
    initImgWidth.value = img.width;
    initImgHeight.value = img.height;
    updataImgData();
    // Update ctx
    if (ctx.value !== null && ctx.value !== null) {
      ctx.value.clearRect(0, 0, ctx.value.canvas.width, ctx.value.canvas.height);
    }
    ctx.value = canvas.value.getContext('2d');

    // 计算初始缩放比例
    const scaleValue = Math.min(viewportWidth.value / img.width, viewportHeight.value / img.height);
    scale.value = scaleValue; //scale.value修改，自动调用watch scale

    console.log('scale:', scale);
    console.log('viewportWidth.value:', viewportWidth.value);
    console.log('viewportHeight .value:', viewportHeight.value);
    console.log('img.width:', img.width);
    console.log('img.height:', img.height);
  };
}

// Get files
const imgFileInput = ref(null);
let imgFileName = ref(null);
function chooseImgFile() {
  imgFileInput.value.value = null;
  imgFileInput.value.click();
}
function loadImgFile(event) {
  console.log(event.target);
  outputMessage('Load Pic......');
  const file = event.target.files[0];
  imgFileName.value = file.name;
  const reader = new FileReader();
  reader.onload = e => {
    imageSrc.value = e.target.result;
    imageObj.value = new Image();
    imageObj.value.src = e.target.result;
    initDrawImg();
  };
  reader.readAsDataURL(file);
}

function chooseJsonFile() {
  try {
    ipcRenderer.send('open-json-file-dialog');
  } catch (error) {
    console.error('Error while sending IPC message:', error);
  }
}

let jsonFileName = ref(null);
let jsonData = { str: '', path: '', fileName: '' };
ipcRenderer.on('choose-json-file-response', (event, response) => {
  try {
    if (response.success) {
      jsonData = response.jsonInfo;
      jsonFileName.value = jsonData.fileName;
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

const scaleRange = 60;
const onWheel = event => {
  if (event.deltaY < 0) {
    if (scale.value < 0.9) scale.value += 0.1;
    else if (scale.value < scaleRange) scale.value = Math.floor(scale.value + 1);
  } else {
    if (scale.value > 0.2) {
      if (scale.value <= 1) scale.value -= 0.1;
      else scale.value = Math.ceil(scale.value - 1);
    } else scale.value = 0.1;
  }
  console.log(scale.value);
};

// for zoom
const zoomView = ref(null);
const realDot2GetZoom = ref({ x: -1, y: -1 });
function updateZoomView(event) {
  if (!imageObj.value) return;

  let canvasCoor = {
    x: event.clientX,
    y: event.clientY,
  };
  transCanvas2RealInfo(realDot2GetZoom.value, canvasCoor);
  // Make the mouse in the middle of the zoomRect
  realDot2GetZoom.value.x = Math.min(Math.max(realDot2GetZoom.value.x - 3, sourceLTCoor.x), sourceRBCoor.x - 5);
  realDot2GetZoom.value.y = Math.min(Math.max(realDot2GetZoom.value.y - 3, sourceLTCoor.y), sourceRBCoor.y - 5);

  // Draw scaled rect in canvas
  let rectCoor = {
    x: realDot2GetZoom.value.x - 1,
    y: realDot2GetZoom.value.y - 1,
  };

  transReal2CanvasInfo(canvasCoor, rectCoor);
  updateRectanglePosition(canvasCoor.x, canvasCoor.y);

  // Draw zoom
  drawZoomAnddots();
}

function updateDotsCanvasCoor() {
  // 新增一个红点
  const realDotsNum = dotsRealCoor.value.length;
  if (dotsCanvasCoor.value.length !== realDotsNum) {
    dotsCanvasCoor.value.push({ x: 0, y: 0 });
    transReal2CanvasInfo(dotsCanvasCoor.value[realDotsNum - 1], dotsRealCoor.value[realDotsNum - 1]);
    if (scale.value >= gridLimit) {
      dotsCanvasCoor.value[realDotsNum - 1].x += 1;
      dotsCanvasCoor.value[realDotsNum - 1].y += 1;
    }
  }

  // 更新所有点的坐标
  else {
    for (let i = 0; i < realDotsNum; ++i) {
      transReal2CanvasInfo(dotsCanvasCoor.value[i], dotsRealCoor.value[i]);
      if (scale.value >= gridLimit) {
        dotsCanvasCoor.value[i].x += 1;
        dotsCanvasCoor.value[i].y += 1;
      }
    }
  }
}

function transScaled2RealInfo(targetCoor, scaledCoor) {
  targetCoor.x = Math.floor(scaledCoor.x / scale.value);
  targetCoor.y = Math.floor(scaledCoor.y / scale.value);
}

function transReal2ScaledInfo(targetCoor, realCoor) {
  targetCoor.x = realCoor.x * scale.value;
  targetCoor.y = realCoor.y * scale.value;
}

function transScaled2CanvasInfo(targetCoor, scaledCoor) {
  if (scale.value >= gridLimit) {
    let realCoor = { x: 0, y: 0 };
    transScaled2RealInfo(realCoor, scaledCoor);
    transReal2CanvasInfo(targetCoor, realCoor);
  } else {
    targetCoor.x = scaledCoor.x + offsetX.value + offsetCanvasLeft;
    targetCoor.y = scaledCoor.y + offsetY.value + offsetCanvasTop;
  }
}

// function transCanvas2ScaledInfo(targetCoor, canvasCoor) {
//   targetCoor.x = canvasCoor.x - offsetX.value - offsetCanvasLeft;
//   targetCoor.y = canvasCoor.y - offsetY.value - offsetCanvasTop;
// }
function transReal2CanvasInfo(targetCoor, realCoor, setScale = 0) {
  if (setScale === 0) setScale = scale.value;
  let xOffsetGrid = 0,
    yOffsetGrid = 0;
  if (setScale >= gridLimit) {
    xOffsetGrid = realCoor.x - sourceLTCoor.x;
    yOffsetGrid = realCoor.y - sourceLTCoor.y;
  }
  targetCoor.x = realCoor.x * setScale + xOffsetGrid + offsetX.value + offsetCanvasLeft;
  targetCoor.y = realCoor.y * setScale + yOffsetGrid + offsetY.value + offsetCanvasTop;
}

function transCanvas2RealInfo(targetCoor, canvasCoor, setScale = 0) {
  if (setScale === 0) setScale = scale.value;
  let xOffsetGrid = 0,
    yOffsetGrid = 0;
  if (setScale >= gridLimit) {
    const xResult = (canvasCoor.x - canvasLTCoor.x) / (setScale + 1);
    const yResult = (canvasCoor.y - canvasLTCoor.y) / (setScale + 1);
    xOffsetGrid = Number.isInteger(xResult) ? xResult : Math.floor(xResult) + 1;
    yOffsetGrid = Number.isInteger(yResult) ? yResult : Math.floor(yResult) + 1;
  }

  targetCoor.x = Math.floor((canvasCoor.x - xOffsetGrid - offsetX.value - offsetCanvasLeft) / setScale);
  targetCoor.y = Math.floor((canvasCoor.y - yOffsetGrid - offsetY.value - offsetCanvasTop) / setScale);
}

function updateRectanglePosition(left, top) {
  if (scale.value >= gridLimit) return;
  // 获取 .rectangle 元素
  let rectangle = document.querySelector('.rectangle');

  // 更新 left 和 top 属性
  rectangle.style.left = left + 'px';
  rectangle.style.top = top + 'px';
}

const viewportWidth = ref(0);
const viewportHeight = ref(0);
async function updateViewSize() {
  if (divRef.value) {
    viewportWidth.value = divRef.value.offsetWidth - 4; // - 4(border 2 * 2)
    viewportHeight.value = divRef.value.offsetHeight - 4;
    await nextTick();

    //Reset ctx.value when update canvasSize
    initCanvasSettings();
    updateViewPortDraw();
  }
}

function initCanvasSettings() {
  if (canvas.value === null || canvas.value === null) return;
  if (ctx.value === null || ctx.value === null) {
    ctx.value = canvas.value.getContext('2d');
  }

  // 禁用图像平滑，使图像像素化
  ctx.value.imageSmoothingEnabled = false;
  ctx.value.mozImageSmoothingEnabled = false;
  ctx.value.webkitImageSmoothingEnabled = false;
  ctx.value.msImageSmoothingEnabled = false;
}

function initZoomSettings() {
  const zoomctx = zoomView.value.getContext('2d');
  zoomctx.imageSmoothingEnabled = false;
  zoomctx.mozImageSmoothingEnabled = false;
  zoomctx.webkitImageSmoothingEnabled = false;
  zoomctx.msImageSmoothingEnabled = false;
  zoomctx.fillStyle = 'rgb(255,0,0)'; // 设置颜色
}
</script>

<style scoped>
* {
  user-select: none;
}
/* 添加样式来高亮当前行 */
pre .highlighted-line {
  background-color: #ffff006b; /* Yellow color with some transparency */
}
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
  margin-bottom: 20px;
  display: flex;
}
.zoom-style {
  width: 120px;
  height: 120px;
  border: none;
}

.fileInfo-style {
  font-size: 16px;
  margin-bottom: 20px;
  word-wrap: break-word;
}

.inputText-style {
  font-size: 16px;
  width: 120px;
  margin-bottom: 20px;
}

.outputText-style {
  font-size: 12px;
  margin-bottom: 20px;
  word-wrap: break-word;
}

.button-style {
  border-radius: 12px;
  background-color: #4caf50;
  color: white;
  border: none;
  padding: 8px 8px;
  text-align: center;
  text-decoration: none;
  font-size: 16px;
  width: calc(100%);
  cursor: pointer;
}

.delete-button-style {
  border-radius: 12px;
  background-color: #f44336;
  /* 修改背景颜色为红色 */
  color: white;
  border: none;
  padding: 8px 8px;
  text-align: center;
  text-decoration: none;
  display: inline-block;
  /* 修改为内联块以适应多个按钮 */
  font-size: 16px;
  margin-bottom: 15px;
  /* 修改边距以适应多个按钮 */
  cursor: pointer;
}
.json-container {
  width: calc(25%);
  /*20*2 + 120 + 2((1)*2) + 4(blankspace)*/
  height: calc(100%);
  margin-left: auto;
  overflow: hidden;
  border: 2px solid gray;
}
.image-container {
  background: url('../src/assets/bg.png') repeat;
  width: calc(75% - 170px);
  /* 20*2 + 122 + 4(blankspace)*2 */
  height: calc(100% - 40px);
  top: 20px;
  left: 20px;
  position: fixed;
  overflow: hidden;
  border: 2px solid gray;
}

.dot {
  position: absolute;
  width: 1px;
  height: 1px;
  background-color: red;
}

.rectangle {
  position: absolute;
  width: 8px;
  /* 矩形的宽度 */
  height: 8px;
  /* 矩形的高度 */
  border: 1px solid rgba(255, 0, 0, 0.5);
  /* 红色的边界 */
  background-color: transparent;
  /* 透明的背景色 */
  pointer-events: none;
  /* 忽略鼠标事件 */
}

.button-group {
  display: flex;
  flex-direction: column;
  row-gap: 10px;
}
</style>

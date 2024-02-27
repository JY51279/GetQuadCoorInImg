<template>
  <input ref="imgFileInput" type="file" accept="image/*" style="display: none" @change="loadImgFile" />
  <div class="container">
    <div ref="divRef" class="image-container" @wheel.prevent="onWheel">
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
        v-for="dot in dotsCanvasCoord"
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
        <button class="button-style" @click="saveDots">Save Dots</button>
        <button class="button-style" @click="clearDots">Clear Dots</button>
        <button class="button-style" @click="clearMessage">Clear Msgs</button>
        <button class="button-style" @click="resetPosition">Reset Pos</button>
      </div>
    </div>

    <jsonItems ref="jsonView" @update-quad-info="updateQuadInfo"></jsonItems>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useMouse, useMousePressed } from '@vueuse/core';
import cloneDeep from 'lodash/cloneDeep';
import jsonItems from './JsonView.vue';
import {
  resetJsonProcess,
  resetPicJson,
  getAdjacentImagePath,
  setQuadInfo,
  updateQuadIndex,
  updateJson,
  getJsonPicNum,
} from '../utils/JsonProcess.js';
import { KEYS } from '../utils/BasicFuncs.js';

const ipcRenderer = window.electron.ipcRenderer;
const offsetCanvasLeft = 22;
const offsetCanvasTop = 22;
const divRef = ref(null);
const canvas = ref(null);
const scale = ref(1);

const quadInfo = ref({ quadNum: 0, quadTotal: 0 });
function updateQuadInfo(quadNum = -1, quadTotal = -1) {
  if (quadNum !== -1) quadInfo.value.quadNum = quadNum;
  if (quadTotal !== -1) quadInfo.value.quadTotal = quadTotal;
}
watch(quadInfo, newQuadInfo => {
  updateQuadIndex(newQuadInfo.quadNum - 1);
});

const picInfo = ref({ picNum: 0, picTotalNum: 0 });
const jsonView = ref(null);
function initFromJson() {
  resetPicJson(imgFileName.value);
  jsonView.value.updateJsonView();
  picInfo.value = getJsonPicNum();
}
// Basic delete
function deletePt(ptIndex) {
  if (ptIndex !== -1 && ptIndex < dotsCanvasCoord.value.length) {
    dotsCanvasCoord.value.splice(ptIndex, 1);
    dotsRealCoord.value.splice(ptIndex, 1);
    drawZoomAndDots();
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
  let canvasCoord = {
    x: e.clientX,
    y: e.clientY,
  };
  let realCoord = { x: 0, y: 0 };

  transCanvas2RealInfo(realCoord, canvasCoord); // 得到原始图片对应坐标
  transReal2CanvasInfo(canvasCoord, realCoord); // 得到贴合后画布确切坐标

  const existingDotIndex = dotsRealCoord.value.findIndex(
    realDot => Math.abs(realDot.x - realCoord.x) < 2 && Math.abs(realDot.y - realCoord.y) < 2,
  );
  // console.log('***********getDotInfo');
  // console.log('e.client: (' + e.clientX + ', ' + e.clientY + ')');
  // console.log('canvasCoord: (' + canvasCoord.x + ', ' + canvasCoord.y + ')');
  // console.log('realCoord: (' + realCoord.x + ', ' + realCoord.y + ')');
  return { canvasCoord, realCoord, existingDotIndex };
}

let imgPixelData2D = [];
function updateImgData() {
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
const canvasLTCoord = { x: 0, y: 0 };
const canvasRBCoord = { x: 0, y: 0 };
const sourceLTCoord = { x: 0, y: 0 };
const sourceRBCoord = { x: 0, y: 0 };
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
    // console.log('offset: (' + offsetX.value + ', ' + offsetY.value + ')');
    // console.log('maxOff: (' + viewportWidth.value + ', ' + viewportHeight.value + ')');
    // console.log('minOff: (' + -initImgWidth.value * scale.value + ', ' + -initImgHeight.value * scale.value + ')');
    // console.log('scale: ' + scale.value);
    ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height);
    outputMessage('The image is out of the visible area.');
    return;
  }

  // Calc Overlap area
  const x1 = Math.max(0, offsetX.value);
  const x2 = Math.min(viewportWidth.value - 1, offsetX.value + initImgWidth.value * scale.value - 1);
  const y1 = Math.max(0, offsetY.value);
  const y2 = Math.min(viewportHeight.value - 1, offsetY.value + initImgHeight.value * scale.value - 1);
  let imgScaledLTCoord = { x: x1 - offsetX.value, y: y1 - offsetY.value };
  let imgScaledRBCoord = { x: x2 - offsetX.value, y: y2 - offsetY.value };

  //Calc left-top and right-bottom pts in canvas
  transScaled2RealInfo(sourceLTCoord, imgScaledLTCoord);
  transScaled2RealInfo(sourceRBCoord, imgScaledRBCoord);

  transReal2ScaledInfo(imgScaledLTCoord, sourceLTCoord); // 使点位置与图片像素贴合
  transReal2ScaledInfo(imgScaledRBCoord, {
    x: sourceRBCoord.x + 1,
    y: sourceRBCoord.y + 1,
  }); //得到目标范围外的右下一点，用以后续计算dw dh

  const sw = Math.abs(sourceLTCoord.x - sourceRBCoord.x) + 1;
  const sh = Math.abs(sourceLTCoord.y - sourceRBCoord.y) + 1;
  const dw = Math.abs(imgScaledRBCoord.x - imgScaledLTCoord.x);
  const dh = Math.abs(imgScaledRBCoord.y - imgScaledLTCoord.y);

  transScaled2CanvasInfo(canvasLTCoord, imgScaledLTCoord);
  transScaled2CanvasInfo(canvasRBCoord, imgScaledRBCoord);

  //Draw
  ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height);
  if (scale.value < gridLimit) {
    initCanvasSettings();
    ctx.value.drawImage(
      imageObj.value,
      sourceLTCoord.x,
      sourceLTCoord.y,
      sw,
      sh,
      canvasLTCoord.x,
      canvasLTCoord.y,
      dw,
      dh,
    );
  } else {
    drawGrid();
    drawImgInGrid(sw, sh);
  }
}

// Area: [canvasLTCoord, canvasRBCoord)
function drawGrid() {
  // 设置间隔
  const space = scale.value + 1;
  // 区域的左上和右下
  const areaX1 = canvasLTCoord.x,
    areaX2 = Math.min(canvasRBCoord.x, canvas.value.width);
  const areaY1 = canvasLTCoord.y,
    areaY2 = Math.min(canvasRBCoord.y, canvas.value.height);
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
  const startX = canvasLTCoord.x + 1,
    startY = canvasLTCoord.y + 1; // 包括最左/上侧网格线
  for (let shOffset = 0; shOffset < sourceHeight; ++shOffset) {
    const canvasY = startY + shOffset * space;
    const sourceY = sourceLTCoord.y + shOffset;
    for (let swOffset = 0; swOffset < sourceWidth; ++swOffset) {
      const canvasX = startX + swOffset * space;
      const sourceX = sourceLTCoord.x + swOffset;

      ctx.value.fillStyle = imgPixelData2D[sourceX][sourceY];
      ctx.value.fillRect(canvasX, canvasY, dw, dh);
    }
  }
}

function drawZoomAndDots() {
  if (realDot2GetZoom.value.x === -1) return;
  const zoomCtx = zoomView.value.getContext('2d');
  zoomCtx.drawImage(imageObj.value, realDot2GetZoom.value.x, realDot2GetZoom.value.y, 6, 6, 0, 0, 120, 120);

  for (let i = 0; i < dotsRealCoord.value.length; ++i) {
    drawDotInZoom(dotsRealCoord.value[i]);
  }
}

function drawDotInZoom(newRealCoord) {
  if (realDot2GetZoom.value.x === -1) return;
  const zoomCtx = zoomView.value.getContext('2d');
  let transX = newRealCoord.x - realDot2GetZoom.value.x;
  let transY = newRealCoord.y - realDot2GetZoom.value.y;
  if (transX >= 0 && transX < 6 && transY >= 0 && transY < 6) {
    zoomCtx.fillRect(transX * 20, transY * 20, 20, 20);
  }
}

function updateViewPortDraw() {
  if (imageSrc.value === null || imageSrc.value === '') return;
  drawCanvas();
  updateDotsCanvasCoord();
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
  let canvasCoord = cloneDeep(mouseCoord);
  let realCoord = { x: 0, y: 0 };
  transCanvas2RealInfo(realCoord, canvasCoord, oldScale);
  if (
    realCoord.x < sourceLTCoord.x ||
    realCoord.x > sourceRBCoord.x ||
    realCoord.y < sourceLTCoord.y ||
    realCoord.y > sourceRBCoord.y
  )
    return;

  // purpose：Scale the image based on the mouseCoord
  // Calc fineTuning
  transReal2CanvasInfo(canvasCoord, realCoord, oldScale);
  const offsetPixels = {
    x: mouseCoord.x - canvasCoord.x,
    y: mouseCoord.y - canvasCoord.y,
  };
  const fineTuning = {
    x: Math.floor((offsetPixels.x / oldScale) * newScale),
    y: Math.floor((offsetPixels.y / oldScale) * newScale),
  };

  // Calc scaled canvasCoord without updating offset
  transReal2CanvasInfo(canvasCoord, realCoord, newScale);

  offsetX.value -= canvasCoord.x + fineTuning.x - mouseCoord.x;
  offsetY.value -= canvasCoord.y + fineTuning.y - mouseCoord.y;
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

const mouseCoord = { x: 0, y: 0 };
const output = ref(null);
onMounted(() => {
  console.log('onMounted...');
  initZoomSettings();
  updateViewSize();
  window.addEventListener('resize', updateViewSize);
  window.addEventListener('mousemove', e => {
    mouseCoord.x = e.clientX;
    mouseCoord.y = e.clientY;
    mouseMoved = true;
  });
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);

  const outputDiv = output.value;
  outputDiv.scrollTop = outputDiv.scrollHeight;
});

onUnmounted(() => {
  console.log('onUnmounted...');
  window.removeEventListener('resize', updateViewSize);
  window.removeEventListener('mousemove', e => {
    mouseCoord.x = e.clientX;
    mouseCoord.y = e.clientY;
    mouseMoved = true;
  });
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
});

// 监听键盘事件
// TODO 补全快捷键
let isLogging = false;
function handleKeyDown(e) {
  // 兼容不同浏览器的 keyCode 或者 code 属性
  const keyCode = e.keyCode || e.code;
  if (!isLogging && keyCode >= 48 && keyCode <= 57) {
    // 按下了键盘上侧的数字键
    const digit = keyCode - 48;
    //console.log(`Pressed number: ${digit}`);
    clearOneDot(digit - 1);
  }

  if (e.ctrlKey) {
    e.preventDefault(); // 阻止默认行为
    switch (e.key) {
      case 's':
        saveDots(); // 执行保存操作
        break;
      case 'c':
        clearDots();
        break;
      case 'r':
        resetPosition();
        break;
      case 'm':
        clearMessage();
        break;
      default:
        return; // 不执行后续代码
    }
  } else {
    switch (e.key) {
      case 'ArrowLeft':
      case 'a':
        e.preventDefault();
        changeImageByArrowKeys(KEYS.PREVIOUS);
        break;
      case 'ArrowRight':
      case 'd':
        e.preventDefault();
        changeImageByArrowKeys(KEYS.NEXT);
        break;
      case 'ArrowUp':
      case 'w':
        e.preventDefault();
        jsonView.value.updateLightIndex(KEYS.PREVIOUS);
        break;
      case 'ArrowDown':
      case 's':
        e.preventDefault();
        jsonView.value.updateLightIndex(KEYS.NEXT);
        break;
      default:
        return; // 不执行后续代码
    }
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

// Click button to del dot
function clearOneDot(index) {
  deletePt(index);
}

// Click canvas to get dot
const dotsCanvasCoord = ref([]);
const dotsRealCoord = ref([]);
function toggleDot(e) {
  if (imageSrc.value == null || imageSrc.value == '' || !isNotLongPress) {
    return;
  }
  // 如果红点在图片显示范围外，输出“The pt is not in the pic.”
  if (
    e.clientX < canvasLTCoord.x ||
    e.clientX >= canvasRBCoord.x ||
    e.clientY < canvasLTCoord.y ||
    e.clientY >= canvasRBCoord.y
  ) {
    outputMessage('The pt is not in the pic.');
    return;
  }

  // eslint-disable-next-line no-unused-vars
  const { canvasCoord, realCoord, existingDotIndex } = getDotInfo(e);
  if (existingDotIndex !== -1) {
    // 如果已经存在红点，删除它
    deletePt(existingDotIndex);
    outputMessage('Delete the pt.');
  } else if (dotsCanvasCoord.value.length >= 4) {
    // 如果已经有四个红点，输出“Already set 4 pts.”
    outputMessage('Already set 4 pts.');
  } else {
    // 否则，添加一个新的红点
    dotsRealCoord.value.push({ x: realCoord.x, y: realCoord.y });
    updateDotsCanvasCoord();
    drawDotInZoom(realCoord);
    if (dotsRealCoord.value.length === 4) {
      setQuadInfo(dotsRealCoord.value);
    }
  }
}

function resetPosition() {
  offsetX.value = 0;
  offsetY.value = 0;
  updateViewPortDraw();
}

function clearDots() {
  dotsCanvasCoord.value = [];
  dotsRealCoord.value = [];
  //outputMessage('clearDots Successfully.');
}

function saveDots() {
  let updateJsonRes = updateJson(jsonData);
  if (updateJsonRes !== true) {
    outputMessage(updateJsonRes);
    return;
  }
  saveJsonFile(jsonData);
  jsonView.value.modifyJsonItem();
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
  initFromJson();
  const img = new Image();
  img.src = imageSrc.value;
  img.onload = () => {
    // Update imgInfo
    initImgWidth.value = img.width;
    initImgHeight.value = img.height;
    updateImgData();
    // Update ctx
    if (ctx.value !== null && ctx.value !== null) {
      ctx.value.clearRect(0, 0, ctx.value.canvas.width, ctx.value.canvas.height);
    }
    ctx.value = canvas.value.getContext('2d');

    // 计算初始缩放比例
    const scaleValue = Math.min(viewportWidth.value / img.width, viewportHeight.value / img.height);
    scale.value = scaleValue; //scale.value修改，自动调用watch scale

    console.log('scale:', scale);
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
  //console.log(event.target);
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
function changeImageByArrowKeys(direction) {
  const path = getAdjacentImagePath(direction);
  loadImgFromPath(path);
}
function loadImgFromPath(path) {
  outputMessage('Load Pic from Path...');
  ipcRenderer.send('open-pic-file', path);
}

ipcRenderer.on('open-pic-file-response', (e, response) => {
  try {
    if (response.success) {
      const image = new Image();
      image.src = response.picInfo.str;

      // 在图片加载完成后执行的操作
      image.onload = () => {
        console.log('image.onload');

        imgFileName.value = response.picInfo.fileName;
        imageSrc.value = image.src;
        imageObj.value = new Image();
        imageObj.value.src = image.src;
        initDrawImg(); // 在图片加载完成后再调用 initDrawImg 方法
        outputMessage('Pic data input successful.');
      };
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
    console.error('Error while sending IPC message:', error);
  }
}

let jsonFileName = ref(null);
let jsonData = { str: '', fileName: '' };
ipcRenderer.on('choose-json-file-response', (e, response) => {
  try {
    if (response.success) {
      jsonData = response.jsonInfo;
      jsonFileName.value = jsonData.fileName;
      resetJsonProcess(jsonData.str, selectedOption.value[0]);
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

  let canvasCoord = {
    x: event.clientX,
    y: event.clientY,
  };
  transCanvas2RealInfo(realDot2GetZoom.value, canvasCoord);
  // Make the mouse in the middle of the zoomRect
  realDot2GetZoom.value.x = Math.min(Math.max(realDot2GetZoom.value.x - 3, sourceLTCoord.x), sourceRBCoord.x - 5);
  realDot2GetZoom.value.y = Math.min(Math.max(realDot2GetZoom.value.y - 3, sourceLTCoord.y), sourceRBCoord.y - 5);

  // Draw scaled rect in canvas
  let rectCoord = {
    x: realDot2GetZoom.value.x - 1,
    y: realDot2GetZoom.value.y - 1,
  };

  transReal2CanvasInfo(canvasCoord, rectCoord);
  updateRectanglePosition(canvasCoord.x, canvasCoord.y);

  // Draw zoom
  drawZoomAndDots();
}

function updateDotsCanvasCoord() {
  // 新增一个红点
  const realDotsNum = dotsRealCoord.value.length;
  if (dotsCanvasCoord.value.length !== realDotsNum) {
    dotsCanvasCoord.value.push({ x: 0, y: 0 });
    transReal2CanvasInfo(dotsCanvasCoord.value[realDotsNum - 1], dotsRealCoord.value[realDotsNum - 1]);
    if (scale.value >= gridLimit) {
      dotsCanvasCoord.value[realDotsNum - 1].x += 1;
      dotsCanvasCoord.value[realDotsNum - 1].y += 1;
    }
  }

  // 更新所有点的坐标
  else {
    for (let i = 0; i < realDotsNum; ++i) {
      transReal2CanvasInfo(dotsCanvasCoord.value[i], dotsRealCoord.value[i]);
      if (scale.value >= gridLimit) {
        dotsCanvasCoord.value[i].x += 1;
        dotsCanvasCoord.value[i].y += 1;
      }
    }
  }
}

function transScaled2RealInfo(targetCoord, scaledCoord) {
  targetCoord.x = Math.floor(scaledCoord.x / scale.value);
  targetCoord.y = Math.floor(scaledCoord.y / scale.value);
}

function transReal2ScaledInfo(targetCoord, realCoord) {
  targetCoord.x = realCoord.x * scale.value;
  targetCoord.y = realCoord.y * scale.value;
}

function transScaled2CanvasInfo(targetCoord, scaledCoord) {
  if (scale.value >= gridLimit) {
    let realCoord = { x: 0, y: 0 };
    transScaled2RealInfo(realCoord, scaledCoord);
    transReal2CanvasInfo(targetCoord, realCoord);
  } else {
    targetCoord.x = scaledCoord.x + offsetX.value + offsetCanvasLeft;
    targetCoord.y = scaledCoord.y + offsetY.value + offsetCanvasTop;
  }
}

// function transCanvas2ScaledInfo(targetCoord, canvasCoord) {
//   targetCoord.x = canvasCoord.x - offsetX.value - offsetCanvasLeft;
//   targetCoord.y = canvasCoord.y - offsetY.value - offsetCanvasTop;
// }
function transReal2CanvasInfo(targetCoord, realCoord, setScale = 0) {
  if (setScale === 0) setScale = scale.value;
  let xOffsetGrid = 0,
    yOffsetGrid = 0;
  if (setScale >= gridLimit) {
    xOffsetGrid = realCoord.x - sourceLTCoord.x;
    yOffsetGrid = realCoord.y - sourceLTCoord.y;
  }
  targetCoord.x = realCoord.x * setScale + xOffsetGrid + offsetX.value + offsetCanvasLeft;
  targetCoord.y = realCoord.y * setScale + yOffsetGrid + offsetY.value + offsetCanvasTop;
}

function transCanvas2RealInfo(targetCoord, canvasCoord, setScale = 0) {
  if (setScale === 0) setScale = scale.value;
  let xOffsetGrid = 0,
    yOffsetGrid = 0;
  if (setScale >= gridLimit) {
    const xResult = (canvasCoord.x - canvasLTCoord.x) / (setScale + 1);
    const yResult = (canvasCoord.y - canvasLTCoord.y) / (setScale + 1);
    xOffsetGrid = Number.isInteger(xResult) ? xResult : Math.floor(xResult) + 1;
    yOffsetGrid = Number.isInteger(yResult) ? yResult : Math.floor(yResult) + 1;
  }

  targetCoord.x = Math.floor((canvasCoord.x - xOffsetGrid - offsetX.value - offsetCanvasLeft) / setScale);
  targetCoord.y = Math.floor((canvasCoord.y - yOffsetGrid - offsetY.value - offsetCanvasTop) / setScale);
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
  const zoomCtx = zoomView.value.getContext('2d');
  zoomCtx.imageSmoothingEnabled = false;
  zoomCtx.mozImageSmoothingEnabled = false;
  zoomCtx.webkitImageSmoothingEnabled = false;
  zoomCtx.msImageSmoothingEnabled = false;
  zoomCtx.fillStyle = 'rgb(255,0,0)'; // 设置颜色
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

.image-container {
  background: url('../src/assets/bg.png') repeat;
  width: calc(75% - 170px);
  /* 20*2 + 122 + 4(blankSpace)*2 */
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

<template>
  <div ref="imgContainerRef" class="image-container" @wheel.prevent="onWheel">
    <canvas
      ref="canvas"
      :width="viewportWidth + offsetCanvasLeft"
      :height="viewportHeight + offsetCanvasTop"
      :style="`transform: translate(${-offsetCanvasLeft}px, ${-offsetCanvasTop}px);
                  transform-origin: 0% 0%;
                  position: absolute;`"
      @click="toggleDot"
      @mousemove="updateZoomView"
    ></canvas>
    <canvas
      ref="canvasForShowQuads"
      :width="viewportWidth + offsetCanvasLeft"
      :height="viewportHeight + offsetCanvasTop"
      :style="`transform: translate(${-offsetCanvasLeft}px, ${-offsetCanvasTop}px);
                  transform-origin: 0% 0%;
                  position: absolute;
                  pointer-events: none;`"
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
  <div class="scale" style="display: flex; position: fixed; left: 40px; bottom: 25px; width: calc(50%); z-index: 9999">
    <input
      v-if="imageObj"
      v-model.number="scale"
      type="number"
      min="0.1"
      :max="scaleRange"
      step="0.1"
      style="width: 60px"
    />
    <input
      v-if="imageObj"
      v-model.number="scale"
      type="range"
      min="1"
      :max="scaleRange"
      step="1"
      style="width: calc(100%)"
    />
  </div>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useMouse, useMousePressed } from '@vueuse/core';
import cloneDeep from 'lodash/cloneDeep';
import { getOuterInnerQuads, drawPath } from '../utils/ImageProcess.js';

import { setQuadInfo } from '../utils/JsonProcess.js';

const dotsRealCoord = reactive([]);
const realDot2GetZoom = ref({ x: -1, y: -1 });
defineExpose({
  //值
  dotsRealCoord,
  realDot2GetZoom,
  //方法
  deletePt,
  clearDots,
  resetPosition,
  initImgInfo,
  resetHighlightQuadIndex,
  addShowQuadIndex,
  clearShowQuadIndex,
  resetQuadsArray,
  changeMouseState,
});

const emits = defineEmits(['update-zoom-view', 'output-message', 'update-dots-real-coord']);

// const props = defineProps({
//   imageSrc: {
//     type: String, // 指定类型为对象
//     default: '', // 默认值为 null
//   },
// });

const props = defineProps({
  imageObj: {
    type: Object, // 指定类型为对象
    default: null, // 默认值为 null
  },
});

const offsetCanvasLeft = 22;
const offsetCanvasTop = 22;
const imgContainerRef = ref(null);
const canvas = ref(null);
const canvasForShowQuads = ref(null);
const scale = ref(1);

function outputMessage(message) {
  emits('output-message', message);
}
// Basic delete
function deletePt(ptIndex) {
  if (ptIndex !== -1 && ptIndex < dotsCanvasCoord.value.length) {
    dotsCanvasCoord.value.splice(ptIndex, 1);
    dotsRealCoord.splice(ptIndex, 1);
    return true;
  }
  return false;
}

// Delete Dot in canvas
function deleteDot(e) {
  if (isDisabledMouse.value) return;
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

  const existingDotIndex = dotsRealCoord.findIndex(
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
  if (!props.imageObj) return;
  // 创建一个Canvas对象
  let canvasTmp = document.createElement('canvas');
  canvasTmp.width = initImgWidth.value;
  canvasTmp.height = initImgHeight.value;

  // 将图像绘制到Canvas上
  var ctxTmp = canvasTmp.getContext('2d');
  ctxTmp.drawImage(props.imageObj, 0, 0);

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
  if (canvas.value === null || canvas.value === null || props.imageObj === null) {
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
      props.imageObj,
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

let quadsArray = [];
function resetQuadsArray(newQuadArray) {
  quadsArray = newQuadArray;
  if (ctxQuad.value) drawCanvasForShowQuads();
}

const highlightQuadIndex = ref(-1);
// eslint-disable-next-line no-unused-vars
watch(highlightQuadIndex, newHighlightQuadIndex => {
  drawCanvasForShowQuads();
});

function resetHighlightQuadIndex(newIndex) {
  highlightQuadIndex.value = newIndex;
}

let showQuadIndex = reactive([]);
// eslint-disable-next-line no-unused-vars
watch(showQuadIndex, newShowQuadIndex => {
  drawCanvasForShowQuads();
});

function addShowQuadIndex(newIndex) {
  if (!showQuadIndex.includes(newIndex)) {
    showQuadIndex.push(newIndex);
  }
}

function clearShowQuadIndex() {
  showQuadIndex.splice(0, showQuadIndex.length);
}

function drawCanvasForShowQuads() {
  if (ctxQuad.value === null || ctxQuad.value === null) {
    console.log('Failed to draw canvas for show quads');
    return;
  }
  ctxQuad.value.clearRect(0, 0, ctxQuad.value.canvas.width, ctxQuad.value.canvas.height);
  drawShowQuads();
  if (highlightQuadIndex.value === -1) return;
  drawQuadLine(quadsArray[highlightQuadIndex.value], true);
}
function drawShowQuads() {
  for (let i = 0; i < showQuadIndex.length; ++i) {
    if (showQuadIndex[i] === highlightQuadIndex.value) continue;
    drawQuadLine(quadsArray[showQuadIndex[i]]);
  }
}
function drawQuadLine(quadRealPoints, isHighlight = false) {
  if (quadRealPoints.length < 4) {
    console.log('Failed to draw quad');
    return;
  }
  const { outerQuadPoints, innerQuadPoints } = getQuads2Draw(quadRealPoints);
  drawQuad(outerQuadPoints, isHighlight);
  clearQuad(innerQuadPoints);
}

function drawQuad(quadPoints, isHighlight = false) {
  if (quadPoints.length < 4) {
    console.log('Failed to draw quad');
    return;
  }
  //Draw highlighted quads with a yellow color, otherwise use green.
  let fillColor = 'green';
  if (isHighlight) {
    fillColor = 'yellow';
  }

  ctxQuad.value.save();
  ctxQuad.value.strokeStyle = 'black';
  ctxQuad.value.lineWidth = 1;
  drawPath(ctxQuad.value, quadPoints);
  ctxQuad.value.stroke();

  ctxQuad.value.fillStyle = fillColor;
  ctxQuad.value.globalAlpha = 0.5;
  ctxQuad.value.fill();

  ctxQuad.value.restore();
}

function clearQuad(quadPoints) {
  if (quadPoints.length < 4) {
    console.log('Failed to clear quad');
    return;
  }
  // 保存之前的上下文状态
  ctxQuad.value.save();

  ctxQuad.value.strokeStyle = 'black';
  ctxQuad.value.lineWidth = 1;
  drawPath(ctxQuad.value, quadPoints);
  ctxQuad.value.stroke();

  ctxQuad.value.clip();

  const minX = Math.min(quadPoints[0].x, quadPoints[1].x, quadPoints[2].x, quadPoints[3].x);
  const minY = Math.min(quadPoints[0].y, quadPoints[1].y, quadPoints[2].y, quadPoints[3].y);
  const maxX = Math.max(quadPoints[0].x, quadPoints[1].x, quadPoints[2].x, quadPoints[3].x);
  const maxY = Math.max(quadPoints[0].y, quadPoints[1].y, quadPoints[2].y, quadPoints[3].y);
  ctxQuad.value.clearRect(minX, minY, maxX - minX, maxY - minY);

  // 恢复之前的上下文状态
  ctxQuad.value.restore();
}

function getQuads2Draw(quadRealPoints) {
  let quadPointsLTInCanvas = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { x: 0, y: 0 },
  ];

  for (let i = 0; i < 4; ++i) {
    transReal2CanvasInfo(quadPointsLTInCanvas[i], quadRealPoints[i]);
  }
  const { outerQuadPoints, innerQuadPoints } = getOuterInnerQuads(quadPointsLTInCanvas, scale.value);
  return { outerQuadPoints, innerQuadPoints };
}

function updateViewPortDraw() {
  if (imageSrc === '') return;
  drawCanvas();
  updateDotsCanvasCoord();
  drawCanvasForShowQuads();
}

// Move
const isDisabledMouse = ref(false);
function changeMouseState(newState = false) {
  isDisabledMouse.value = newState;
}
const autoAdaptBorderDis = 10;
const offsetX = ref(0);
const offsetY = ref(0);
const { x, y } = useMouse();
const { pressed } = useMousePressed({ target: imgContainerRef });
watch([x, y], ([newX, newY], [oldX, oldY]) => {
  if (isDisabledMouse.value) return;
  if (pressed.value) {
    //console.log(`Mouse moved from (${oldX}, ${oldY}) to (${newX}, ${newY})`);
    const deltaX = newX - oldX;
    const deltaY = newY - oldY;
    if (deltaX === 0 && deltaY === 0) return;

    offsetX.value += deltaX;
    offsetY.value += deltaY;

    // auto Adapt Border
    if (!(imageSrc === '')) {
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
onMounted(() => {
  console.log('onMountedIMG...');
  updateViewSize();
  window.addEventListener('resize', updateViewSize);
  window.addEventListener('mousemove', e => {
    mouseCoord.x = e.clientX;
    mouseCoord.y = e.clientY;
    mouseMoved = true;
  });
});

onUnmounted(() => {
  console.log('onUnmountedIMG...');
  window.removeEventListener('resize', updateViewSize);
  window.removeEventListener('mousemove', e => {
    mouseCoord.x = e.clientX;
    mouseCoord.y = e.clientY;
    mouseMoved = true;
  });
});

// Click canvas to get dot
const dotsCanvasCoord = ref([]);

watch(dotsRealCoord, newDotsRealCoord => {
  setQuadInfo(newDotsRealCoord);
  emits('update-dots-real-coord', newDotsRealCoord);
});

function toggleDot(e) {
  if (isDisabledMouse.value || imageSrc === '' || !isNotLongPress) {
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
    dotsRealCoord.push({ x: realCoord.x, y: realCoord.y });
    updateDotsCanvasCoord();
  }
}

function resetPosition() {
  offsetX.value = 0;
  offsetY.value = 0;
  updateViewPortDraw();
}

function clearDots() {
  dotsCanvasCoord.value = [];
  dotsRealCoord.splice(0, dotsRealCoord.length);
  //outputMessage('clearDots Successfully.');
}

// Init Img
const initImgWidth = ref(0);
const initImgHeight = ref(0);
const ctx = ref(null);
const ctxQuad = ref(null);
//const imageObj = ref(null);
let imageSrc = '';
async function initImgInfo() {
  console.log('initImgInfo: ', props.imageObj);
  //console.log(props.imageObj);
  scale.value = 0;
  offsetX.value = 0;
  offsetY.value = 0;
  clearDots();
  imageSrc = props.imageObj.src;
  let img = new Image();
  changeMouseState(true);
  await new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = imageSrc;
  });
  changeMouseState(false);
  console.log(isDisabledMouse.value);
  initImgWidth.value = img.width;
  initImgHeight.value = img.height;
  updateImgData();
  // Update ctx
  if (ctx.value !== null && ctx.value !== null) {
    ctx.value.clearRect(0, 0, ctx.value.canvas.width, ctx.value.canvas.height);
  }
  if (ctxQuad.value !== null && ctxQuad.value !== null) {
    ctxQuad.value.clearRect(0, 0, ctxQuad.value.canvas.width, ctxQuad.value.canvas.height);
  }
  ctx.value = canvas.value.getContext('2d');
  ctxQuad.value = canvasForShowQuads.value.getContext('2d');
  // 计算初始缩放比例
  const scaleValue = Math.min(viewportWidth.value / img.width, viewportHeight.value / img.height);
  scale.value = scaleValue; //scale.value修改，自动调用watch scale

  console.log('scale:', scale.value);
  console.log('img.width:', img.width);
  console.log('img.height:', img.height);
}
const scaleRange = 60;
const onWheel = event => {
  if (isDisabledMouse.value) {
    return;
  }
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

function updateZoomView(e) {
  if (isDisabledMouse.value || !props.imageObj || imageSrc === '') {
    return;
  }
  let rectCoord = updateRealDots2GetZoom(e);
  if (rectCoord) {
    updateRectanglePosition(rectCoord);
    emits('update-zoom-view');
  }
}
function updateRealDots2GetZoom(e) {
  if (imageSrc === '') return;

  let canvasCoord = {
    x: e.clientX,
    y: e.clientY,
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
  return canvasCoord;
}
function updateDotsCanvasCoord() {
  // 新增一个红点
  const realDotsNum = dotsRealCoord.length;
  if (dotsCanvasCoord.value.length !== realDotsNum) {
    dotsCanvasCoord.value.push({ x: 0, y: 0 });
    transReal2CanvasInfo(dotsCanvasCoord.value[realDotsNum - 1], dotsRealCoord[realDotsNum - 1]);
    if (scale.value >= gridLimit) {
      dotsCanvasCoord.value[realDotsNum - 1].x += 1;
      dotsCanvasCoord.value[realDotsNum - 1].y += 1;
    }
  }

  // 更新所有点的坐标
  else {
    for (let i = 0; i < realDotsNum; ++i) {
      transReal2CanvasInfo(dotsCanvasCoord.value[i], dotsRealCoord[i]);
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

function updateRectanglePosition(rectCoord) {
  // 获取 .rectangle 元素
  if (scale.value >= gridLimit) {
    return;
  }
  let rectangle = document.querySelector('.rectangle');

  // 更新 left 和 top 属性
  rectangle.style.left = rectCoord.x + 'px';
  rectangle.style.top = rectCoord.y + 'px';
}

const viewportWidth = ref(0);
const viewportHeight = ref(0);
async function updateViewSize() {
  if (imgContainerRef.value) {
    viewportWidth.value = imgContainerRef.value.offsetWidth - 4; // - 4(border 2 * 2)
    viewportHeight.value = imgContainerRef.value.offsetHeight - 4;
    await nextTick();

    //Reset ctx.value when update canvasSize
    initCanvasSettings();
    updateViewPortDraw();
  }
}

function initCanvasSettings() {
  if (canvas.value === null || canvas.value === null || scale.value >= gridLimit) return;
  if (ctx.value === null || ctx.value === null) {
    ctx.value = canvas.value.getContext('2d');
  }

  // 禁用图像平滑，使图像像素化
  ctx.value.imageSmoothingEnabled = false;
  ctx.value.mozImageSmoothingEnabled = false;
  ctx.value.webkitImageSmoothingEnabled = false;
  ctx.value.msImageSmoothingEnabled = false;
}
</script>

<style scoped>
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
</style>

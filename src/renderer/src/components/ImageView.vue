<template>
  <div
    ref="imgContainerRef"
    class="image-container"
    @mouseenter="mouseEntered"
    @mouseleave="mouseLeft"
    @wheel.prevent="onWheel"
  >
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
    <div v-if="isImgFileLoading" class="loading-overlay">Loading...</div>
    <div v-if="isImgFileLoadingFailed" class="loading-overlay">
      <div class="image-error-content">
        <div class="image-error-title">Failed to load image</div>
        <div class="image-error-label">Path:</div>
        <div class="image-error-path">{{ imageLoadErrorPath || 'Unknown path' }}</div>
      </div>
    </div>
    <div
      v-if="indices2Show"
      class="str-right-mouse"
      :style="{ position: 'absolute', top: `${mouseCoord.y - 20}px`, left: `${mouseCoord.x - 5}px` }"
    >
      {{ indices2Show }}
    </div>
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
      @input="normalizeScaleInput"
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
import { getOuterInnerQuads, drawPath } from '../utils/ImageProcess.js';
import {
  canvasToImagePoint,
  imageToCanvasPoint,
  imageToScaledPoint,
  normalizeScale,
  scaledToCanvasPoint,
  scaledToImagePoint,
} from '../utils/ImageViewGeometry.js';

import { setQuadInfo } from '../state/DatasetState.js';
import { isPointInPolygon } from '../utils/BasicFuncs.js';

const emits = defineEmits([
  'update-zoom-view',
  'output-message',
  'update-dots-real-coord',
  'update-json-highlight-index',
]);

const props = defineProps({
  imageObj: {
    type: Object, // 指定类型为对象
    default: null, // 默认值为 null
  },
  canEdit: {
    type: Boolean,
    default: true,
  },
  imageLoadErrorPath: {
    type: String,
    default: '',
  },
});

// Canvas and viewport state
const offsetCanvasLeft = 22;
const offsetCanvasTop = 22;
const gridLimit = 10;
const scaleRange = 60;
const autoAdaptBorderDis = 10;
const imgContainerRef = ref(null);
const canvas = ref(null);
const canvasForShowQuads = ref(null);
const ctx = ref(null);
const ctxQuad = ref(null);
const scale = ref(1);
const offsetX = ref(0);
const offsetY = ref(0);
const viewportWidth = ref(0);
const viewportHeight = ref(0);
const initImgWidth = ref(0);
const initImgHeight = ref(0);
const canvasLTCoord = { x: 0, y: 0 };
const canvasRBCoord = { x: 0, y: 0 };
const sourceLTCoord = { x: 0, y: 0 };
const sourceRBCoord = { x: 0, y: 0 };
let imageSrc = '';
let viewportDrawFrameId = null;

// Image pixel cache
let imgPixelData = null;
let imgPixelDataWidth = 0;
let imgPixelDataHeight = 0;

// Annotation state
const dotsRealCoord = reactive([]);
const dotsCanvasCoord = ref([]);
const realDot2GetZoom = ref({ x: -1, y: -1 });
let quadsArray = [];
const highlightQuadIndex = ref(-1);
const showQuadIndex = reactive([]);
const outerQuadArray = [];

// Interaction and feedback state
const isDisabledMouse = ref(false);
const mouseIsOverContainer = ref(false);
const mouseCoord = reactive({ x: 0, y: 0 });
const indices2Show = ref('');
const isImgFileLoading = ref(false);
const isImgFileLoadingFailed = ref(false);
let isOverviewMode = false;
let mouseMoved = false;
let timer = null;
let isNotLongPress = true;

defineExpose({
  dotsRealCoord,
  realDot2GetZoom,
  deletePt,
  clearDots,
  resetPosition,
  initImgInfo,
  resetHighlightQuadIndex,
  toggleShowQuadIndex,
  addShowQuadIndex,
  clearShowQuadIndex,
  resetQuadsArray,
  changeMouseState,
  toggleMode,
  resetIsImgFileLoading,
  clearImage,
});

function outputMessage(message) {
  emits('output-message', message);
}

// Point editing
function deletePt(ptIndex) {
  if (Number.isInteger(ptIndex) && ptIndex >= 0 && ptIndex < dotsCanvasCoord.value.length) {
    dotsCanvasCoord.value.splice(ptIndex, 1);
    dotsRealCoord.splice(ptIndex, 1);
    return true;
  }
  return false;
}

function deleteDot(e) {
  if (isDisabledMouse.value || !props.canEdit) return;
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
  return { canvasCoord, realCoord, existingDotIndex };
}

// Image pixel cache and base image rendering
function clearImgPixelData() {
  imgPixelData = null;
  imgPixelDataWidth = 0;
  imgPixelDataHeight = 0;
}

function updateImgData() {
  clearImgPixelData();
  if (!props.imageObj) return;

  const canvasTmp = document.createElement('canvas');
  canvasTmp.width = initImgWidth.value;
  canvasTmp.height = initImgHeight.value;

  const ctxTmp = canvasTmp.getContext('2d');
  if (ctxTmp === null) throw new Error('Failed to create the image pixel canvas context.');
  ctxTmp.drawImage(props.imageObj, 0, 0);

  const imageData = ctxTmp.getImageData(0, 0, canvasTmp.width, canvasTmp.height);
  imgPixelData = imageData.data;
  imgPixelDataWidth = imageData.width;
  imgPixelDataHeight = imageData.height;
}

function getPixelColor(sourceX, sourceY) {
  if (
    imgPixelData === null ||
    sourceX < 0 ||
    sourceX >= imgPixelDataWidth ||
    sourceY < 0 ||
    sourceY >= imgPixelDataHeight
  ) {
    return null;
  }

  const pixelOffset = (sourceY * imgPixelDataWidth + sourceX) * 4;
  const red = imgPixelData[pixelOffset];
  const green = imgPixelData[pixelOffset + 1];
  const blue = imgPixelData[pixelOffset + 2];
  const alpha = imgPixelData[pixelOffset + 3] / 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function drawCanvas() {
  if (canvas.value === null || ctx.value === null || props.imageObj === null) {
    outputMessage('drawCanvas canvas Error.');
    return;
  }
  if (
    offsetX.value >= viewportWidth.value ||
    offsetY.value >= viewportHeight.value ||
    offsetX.value <= -initImgWidth.value * scale.value ||
    offsetY.value <= -initImgHeight.value * scale.value
  ) {
    ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height);
    outputMessage('The image is out of the visible area.');
    return;
  }

  const x1 = Math.max(0, offsetX.value);
  const x2 = Math.min(viewportWidth.value - 1, offsetX.value + initImgWidth.value * scale.value - 1);
  const y1 = Math.max(0, offsetY.value);
  const y2 = Math.min(viewportHeight.value - 1, offsetY.value + initImgHeight.value * scale.value - 1);
  let imgScaledLTCoord = { x: x1 - offsetX.value, y: y1 - offsetY.value };
  let imgScaledRBCoord = { x: x2 - offsetX.value, y: y2 - offsetY.value };

  transScaled2RealInfo(sourceLTCoord, imgScaledLTCoord);
  transScaled2RealInfo(sourceRBCoord, imgScaledRBCoord);

  transReal2ScaledInfo(imgScaledLTCoord, sourceLTCoord);
  transReal2ScaledInfo(imgScaledRBCoord, {
    x: sourceRBCoord.x + 1,
    y: sourceRBCoord.y + 1,
  });

  const sw = Math.abs(sourceLTCoord.x - sourceRBCoord.x) + 1;
  const sh = Math.abs(sourceLTCoord.y - sourceRBCoord.y) + 1;
  const dw = Math.abs(imgScaledRBCoord.x - imgScaledLTCoord.x);
  const dh = Math.abs(imgScaledRBCoord.y - imgScaledLTCoord.y);

  transScaled2CanvasInfo(canvasLTCoord, imgScaledLTCoord);
  transScaled2CanvasInfo(canvasRBCoord, imgScaledRBCoord);

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

function drawGrid() {
  const space = scale.value + 1;
  const areaX1 = canvasLTCoord.x,
    areaX2 = Math.min(canvasRBCoord.x, canvas.value.width);
  const areaY1 = canvasLTCoord.y,
    areaY2 = Math.min(canvasRBCoord.y, canvas.value.height);
  ctx.value.setLineDash([]);

  for (let y = areaY1; y <= areaY2; y += space) {
    ctx.value.beginPath();
    ctx.value.moveTo(areaX1, y);
    ctx.value.lineTo(areaX2, y);
    ctx.value.stroke();
  }

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
    startY = canvasLTCoord.y + 1;
  for (let shOffset = 0; shOffset < sourceHeight; ++shOffset) {
    const canvasY = startY + shOffset * space;
    const sourceY = sourceLTCoord.y + shOffset;
    for (let swOffset = 0; swOffset < sourceWidth; ++swOffset) {
      const canvasX = startX + swOffset * space;
      const sourceX = sourceLTCoord.x + swOffset;

      const pixelColor = getPixelColor(sourceX, sourceY);
      if (pixelColor === null) continue;
      ctx.value.fillStyle = pixelColor;
      ctx.value.fillRect(canvasX, canvasY, dw, dh);
    }
  }
}

// Annotation overlay rendering
function isValidQuadPoints(quadPoints) {
  return (
    Array.isArray(quadPoints) &&
    quadPoints.length >= 4 &&
    quadPoints.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
  );
}

function resetQuadsArray(newQuadArray, initImageScale) {
  quadsArray = Array.isArray(newQuadArray) ? newQuadArray : [];
  quadsArray.forEach(quad => {
    if (!isValidQuadPoints(quad)) return;
    quad.forEach(dot => {
      dot.x = Math.round(dot.x * initImageScale);
      dot.y = Math.round(dot.y * initImageScale);
    });
  });
}

watch(highlightQuadIndex, (newHighlightQuadIndex, oldHighlightQuadIndex) => {
  if (oldHighlightQuadIndex === newHighlightQuadIndex) return;
  if (moveHighlightToEnd()) return;
  drawCanvasForShowQuads();
});

function resetHighlightQuadIndex(newIndex) {
  highlightQuadIndex.value = newIndex;
}

watch(showQuadIndex, () => {
  drawCanvasForShowQuads();
});

function toggleShowQuadIndex(newIndex) {
  if (!Number.isInteger(newIndex) || newIndex < 0 || newIndex >= quadsArray.length) {
    outputMessage('newIndex out of range.');
    return;
  }
  let index = showQuadIndex.indexOf(newIndex);
  if (index === -1) {
    addShowQuadIndex(newIndex);
  } else {
    showQuadIndex.splice(index, 1);
  }
}

function addShowQuadIndex(newIndex) {
  if (!Number.isInteger(newIndex) || newIndex < 0 || newIndex >= quadsArray.length) {
    outputMessage('newIndex out of range.');
    return;
  }
  if (!showQuadIndex.includes(newIndex)) {
    showQuadIndex.push(newIndex);
    moveHighlightToEnd();
  }
}

function moveHighlightToEnd() {
  let index = showQuadIndex.indexOf(highlightQuadIndex.value);
  if (index !== -1) {
    showQuadIndex.splice(index, 1);
    showQuadIndex.push(highlightQuadIndex.value);
    return true; // highlight outerQuad is in showQuadIndex
  }
  return false; // highlight outerQuad is not in showQuadIndex
}
function clearShowQuadIndex() {
  showQuadIndex.splice(0, showQuadIndex.length);
}

function drawCanvasForShowQuads() {
  if (ctxQuad.value === null) {
    console.warn('Failed to draw canvas for show quads');
    return;
  }
  outerQuadArray.splice(0, outerQuadArray.length);
  indices2Show.value = '';
  ctxQuad.value.clearRect(0, 0, ctxQuad.value.canvas.width, ctxQuad.value.canvas.height);
  drawShowQuads();
  if (!(highlightQuadIndex.value === -1 || highlightQuadIndex.value >= quadsArray.length))
    drawQuadLine(quadsArray[highlightQuadIndex.value], true);
  getMouseInRectIndices();
}
function drawShowQuads() {
  for (let i = 0; i < showQuadIndex.length; ++i) {
    if (showQuadIndex[i] === highlightQuadIndex.value) continue;
    drawQuadLine(quadsArray[showQuadIndex[i]]);
  }
}
function drawQuadLine(quadRealPoints, isHighlight = false) {
  if (!isValidQuadPoints(quadRealPoints)) {
    console.warn('Failed to draw quad');
    return;
  }
  const { outerQuadPoints, innerQuadPoints } = getQuads2Draw(quadRealPoints);
  outerQuadArray.push(outerQuadPoints);
  drawQuad(outerQuadPoints, isHighlight);
  clearQuad(innerQuadPoints);
}

function drawQuad(quadPoints, isHighlight = false) {
  if (quadPoints.length < 4) {
    console.warn('Failed to draw quad');
    return;
  }
  let fillColor = '#00FF00'; // green
  let strokeColor = '#000000'; // black
  if (isHighlight) {
    fillColor = '#0000FF'; // blue
    strokeColor = '#FF0000'; // red
  }
  ctxQuad.value.save();
  ctxQuad.value.strokeStyle = strokeColor;
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
    console.warn('Failed to clear quad');
    return;
  }
  ctxQuad.value.save();

  ctxQuad.value.strokeStyle = '#FFFFFF'; //white
  ctxQuad.value.lineWidth = 1;
  drawPath(ctxQuad.value, quadPoints);
  ctxQuad.value.stroke();

  ctxQuad.value.clip();

  const minX = Math.min(quadPoints[0].x, quadPoints[1].x, quadPoints[2].x, quadPoints[3].x);
  const minY = Math.min(quadPoints[0].y, quadPoints[1].y, quadPoints[2].y, quadPoints[3].y);
  const maxX = Math.max(quadPoints[0].x, quadPoints[1].x, quadPoints[2].x, quadPoints[3].x);
  const maxY = Math.max(quadPoints[0].y, quadPoints[1].y, quadPoints[2].y, quadPoints[3].y);
  ctxQuad.value.clearRect(minX, minY, maxX - minX, maxY - minY);

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

// Viewport redraw scheduling
function cancelScheduledViewPortDraw() {
  if (viewportDrawFrameId === null) return;
  cancelAnimationFrame(viewportDrawFrameId);
  viewportDrawFrameId = null;
}

function drawViewPortNow() {
  if (imageSrc === '') return;
  drawCanvas();
  updateDotsCanvasCoord();
  drawCanvasForShowQuads();
}

function updateViewPortDraw() {
  if (imageSrc === '' || viewportDrawFrameId !== null) return;

  viewportDrawFrameId = requestAnimationFrame(() => {
    viewportDrawFrameId = null;
    drawViewPortNow();
  });
}

function changeMouseState(newState = false) {
  isDisabledMouse.value = newState;
}

// Pan and zoom interaction
const { x, y } = useMouse();
const { pressed } = useMousePressed({ target: imgContainerRef });
watch([x, y], ([newX, newY], [oldX, oldY]) => {
  if (isDisabledMouse.value) return;
  if (pressed.value) {
    updateOffsetMoved(oldX, oldY, newX, newY);
  } else {
    getMouseInRectIndices();
  }
});

const mouseEntered = () => {
  mouseIsOverContainer.value = true;
};

const mouseLeft = () => {
  mouseIsOverContainer.value = false;
};

function updateOffsetMoved(oldX, oldY, newX, newY) {
  const deltaX = newX - oldX;
  const deltaY = newY - oldY;
  if (deltaX === 0 && deltaY === 0) return;

  offsetX.value += deltaX;
  offsetY.value += deltaY;

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

function getMouseInRectIndices() {
  if (mouseIsOverContainer.value !== true || outerQuadArray.length === 0) return;
  indices2Show.value = '';
  const separator = ' ';
  let i = 0;
  for (i = 0; i < showQuadIndex.length; ++i) {
    if (isPointInPolygon(mouseCoord, outerQuadArray[i])) {
      const showNum = showQuadIndex[i] + 1;
      indices2Show.value += showNum + separator;
    }
  }

  //Made sure that the highlighted outerQuad is drawn last.
  if (showQuadIndex.length < outerQuadArray.length && isPointInPolygon(mouseCoord, outerQuadArray[i])) {
    const highlightNum = highlightQuadIndex.value + 1;
    indices2Show.value += highlightNum + separator;
  }
  indices2Show.value = indices2Show.value.trimEnd();

  updateJsonHighlightIndex(indices2Show.value, separator);
}

function updateJsonHighlightIndex(indicesArray, separator) {
  if (!isOverviewMode) return;
  const indicesNumberArray = indicesArray.split(separator).map(Number);
  if (indicesNumberArray.length !== 1) {
    emits('update-json-highlight-index', -1);
    return;
  }
  const targetIndex = indicesNumberArray[0] - 1;
  emits('update-json-highlight-index', targetIndex);
}
function toggleMode() {
  isOverviewMode = !isOverviewMode;
  if (isOverviewMode) {
    outputMessage('Enter Overview Mode');
  } else {
    outputMessage('Quit Overview Mode');
  }
  drawCanvasForShowQuads();
}

function updateOffsetScaled(oldScale, newScale) {
  if (oldScale === 0) return;

  const canvasCoord = { x: mouseCoord.x, y: mouseCoord.y };
  const realCoord = { x: 0, y: 0 };
  transCanvas2RealInfo(realCoord, canvasCoord, oldScale);
  if (
    realCoord.x < sourceLTCoord.x ||
    realCoord.x > sourceRBCoord.x ||
    realCoord.y < sourceLTCoord.y ||
    realCoord.y > sourceRBCoord.y
  )
    return;

  transReal2CanvasInfo(canvasCoord, realCoord, oldScale);
  const offsetPixels = {
    x: mouseCoord.x - canvasCoord.x,
    y: mouseCoord.y - canvasCoord.y,
  };
  const fineTuning = {
    x: Math.floor((offsetPixels.x / oldScale) * newScale),
    y: Math.floor((offsetPixels.y / oldScale) * newScale),
  };

  transReal2CanvasInfo(canvasCoord, realCoord, newScale);

  offsetX.value -= canvasCoord.x + fineTuning.x - mouseCoord.x;
  offsetY.value -= canvasCoord.y + fineTuning.y - mouseCoord.y;
}

watch(scale, (newScale, oldScale) => {
  if (newScale === 0) return;
  const previousScale = normalizeScale(oldScale, 0.1, scaleRange, 1);
  const validScale = normalizeScale(newScale, 0.1, scaleRange, previousScale);
  if (!Object.is(newScale, validScale)) {
    scale.value = validScale;
    return;
  }

  updateOffsetScaled(previousScale, validScale);
  updateViewPortDraw();
});

function normalizeScaleInput(event) {
  const fallbackScale = normalizeScale(scale.value, 0.1, scaleRange, 1);
  scale.value = normalizeScale(event.target.value, 0.1, scaleRange, fallbackScale);
}

watch(pressed, newVal => {
  if (newVal) {
    isNotLongPress = true;
    mouseMoved = false;
    timer = setTimeout(() => {
      isNotLongPress = false;
    }, 150);
  } else {
    clearTimeout(timer);
    if (isNotLongPress && !mouseMoved) {
      isNotLongPress = true;
    } else {
      isNotLongPress = false;
    }
  }
});

function handleWindowMouseMove(e) {
  mouseCoord.x = e.clientX;
  mouseCoord.y = e.clientY;
  mouseMoved = true;
}

// Component lifecycle
onMounted(() => {
  updateViewSize();
  window.addEventListener('resize', updateViewSize);
  window.addEventListener('mousemove', handleWindowMouseMove);
});

onUnmounted(() => {
  window.removeEventListener('resize', updateViewSize);
  window.removeEventListener('mousemove', handleWindowMouseMove);
  cancelScheduledViewPortDraw();
  clearImgPixelData();
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
});

// Point selection
watch(dotsRealCoord, newDotsRealCoord => {
  setQuadInfo(newDotsRealCoord);
  emits('update-dots-real-coord', newDotsRealCoord);
});

function toggleDot(e) {
  if (isDisabledMouse.value || !props.canEdit || imageSrc === '' || !isNotLongPress) {
    return;
  }
  if (
    e.clientX < canvasLTCoord.x ||
    e.clientX >= canvasRBCoord.x ||
    e.clientY < canvasLTCoord.y ||
    e.clientY >= canvasRBCoord.y
  ) {
    outputMessage('The pt is not in the pic.');
    return;
  }

  const { realCoord, existingDotIndex } = getDotInfo(e);
  if (existingDotIndex !== -1) {
    deletePt(existingDotIndex);
    outputMessage('Delete the pt.');
  } else if (dotsCanvasCoord.value.length >= 4) {
    outputMessage('Already set 4 pts.');
  } else {
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
}

// Image lifecycle
function clearImage() {
  cancelScheduledViewPortDraw();
  clearImgPixelData();
  imageSrc = '';
  initImgWidth.value = 0;
  initImgHeight.value = 0;
  scale.value = 0;
  offsetX.value = 0;
  offsetY.value = 0;

  if (ctx.value !== null) {
    ctx.value.clearRect(0, 0, ctx.value.canvas.width, ctx.value.canvas.height);
  }
  if (ctxQuad.value !== null) {
    ctxQuad.value.clearRect(0, 0, ctxQuad.value.canvas.width, ctxQuad.value.canvas.height);
  }
}

async function initImgInfo() {
  scale.value = 0;
  offsetX.value = 0;
  offsetY.value = 0;
  clearDots();
  try {
    if (!props.imageObj?.src) {
      console.warn('Failed to initialize image: the image source is unavailable.');
      return false;
    }

    imageSrc = props.imageObj.src;
    let img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = imageSrc;
    });

    initImgWidth.value = img.width;
    initImgHeight.value = img.height;
    updateImgData();
    if (ctx.value !== null) {
      ctx.value.clearRect(0, 0, ctx.value.canvas.width, ctx.value.canvas.height);
    }
    if (ctxQuad.value !== null) {
      ctxQuad.value.clearRect(0, 0, ctxQuad.value.canvas.width, ctxQuad.value.canvas.height);
    }
    ctx.value = canvas.value.getContext('2d');
    ctxQuad.value = canvasForShowQuads.value.getContext('2d');
    const scaleValue = Math.min(viewportWidth.value / img.width, viewportHeight.value / img.height);
    scale.value = scaleValue;
    await nextTick();
    return true;
  } catch (error) {
    console.error('Error in event handler:', error);
    return false;
  }
}
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
};

// Zoom preview and point positions
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

  realDot2GetZoom.value.x = Math.min(Math.max(realDot2GetZoom.value.x - 3, sourceLTCoord.x), sourceRBCoord.x - 5);
  realDot2GetZoom.value.y = Math.min(Math.max(realDot2GetZoom.value.y - 3, sourceLTCoord.y), sourceRBCoord.y - 5);

  let rectCoord = {
    x: realDot2GetZoom.value.x - 1,
    y: realDot2GetZoom.value.y - 1,
  };

  transReal2CanvasInfo(canvasCoord, rectCoord);
  return canvasCoord;
}
function updateDotsCanvasCoord() {
  const realDotsNum = dotsRealCoord.length;
  if (dotsCanvasCoord.value.length !== realDotsNum) {
    dotsCanvasCoord.value.push({ x: 0, y: 0 });
    transReal2CanvasInfo(dotsCanvasCoord.value[realDotsNum - 1], dotsRealCoord[realDotsNum - 1]);
    if (scale.value >= gridLimit) {
      dotsCanvasCoord.value[realDotsNum - 1].x += 1;
      dotsCanvasCoord.value[realDotsNum - 1].y += 1;
    }
  } else {
    for (let i = 0; i < realDotsNum; ++i) {
      transReal2CanvasInfo(dotsCanvasCoord.value[i], dotsRealCoord[i]);
      if (scale.value >= gridLimit) {
        dotsCanvasCoord.value[i].x += 1;
        dotsCanvasCoord.value[i].y += 1;
      }
    }
  }
}

// Coordinate adapters for component state
function transScaled2RealInfo(targetCoord, scaledCoord) {
  if (scale.value === 0) {
    outputMessage('Failed transScaled2RealInfo: scale==0.');
    return;
  }
  Object.assign(targetCoord, scaledToImagePoint(scaledCoord, scale.value));
}

function transReal2ScaledInfo(targetCoord, realCoord) {
  Object.assign(targetCoord, imageToScaledPoint(realCoord, scale.value));
}

function transScaled2CanvasInfo(targetCoord, scaledCoord) {
  Object.assign(targetCoord, scaledToCanvasPoint(scaledCoord, getCoordinateTransform()));
}

function transReal2CanvasInfo(targetCoord, realCoord, setScale = 0) {
  const targetScale = setScale === 0 ? scale.value : setScale;
  Object.assign(targetCoord, imageToCanvasPoint(realCoord, getCoordinateTransform(targetScale)));
}

function transCanvas2RealInfo(targetCoord, canvasCoord, setScale = 0) {
  const targetScale = setScale === 0 ? scale.value : setScale;
  Object.assign(targetCoord, canvasToImagePoint(canvasCoord, getCoordinateTransform(targetScale)));
}

function getCoordinateTransform(targetScale = scale.value) {
  return {
    scale: targetScale,
    gridLimit,
    sourceLeftTop: sourceLTCoord,
    canvasLeftTop: canvasLTCoord,
    offsetX: offsetX.value,
    offsetY: offsetY.value,
    canvasOffsetLeft: offsetCanvasLeft,
    canvasOffsetTop: offsetCanvasTop,
  };
}

function updateRectanglePosition(rectCoord) {
  if (scale.value >= gridLimit) {
    return;
  }
  let rectangle = document.querySelector('.rectangle');

  rectangle.style.left = rectCoord.x + 'px';
  rectangle.style.top = rectCoord.y + 'px';
}

// Canvas sizing and loading feedback
async function updateViewSize() {
  if (imgContainerRef.value) {
    viewportWidth.value = imgContainerRef.value.offsetWidth - 4;
    viewportHeight.value = imgContainerRef.value.offsetHeight - 4;
    await nextTick();

    initCanvasSettings();
    updateViewPortDraw();
  }
}

function initCanvasSettings() {
  if (canvas.value === null || scale.value >= gridLimit) return;
  if (ctx.value === null) {
    ctx.value = canvas.value.getContext('2d');
  }

  ctx.value.imageSmoothingEnabled = false;
  ctx.value.mozImageSmoothingEnabled = false;
  ctx.value.webkitImageSmoothingEnabled = false;
  ctx.value.msImageSmoothingEnabled = false;
}

function resetIsImgFileLoading(newValue) {
  isImgFileLoading.value = newValue;
  if (isImgFileLoading.value === false && (props.imageObj === null || props.imageObj.src === '')) {
    resetIsImgFileLoadingFailed(true);
  } else {
    resetIsImgFileLoadingFailed(false);
  }
}

function resetIsImgFileLoadingFailed(newValue) {
  isImgFileLoadingFailed.value = newValue;
}
</script>

<style scoped>
.image-container {
  background: url('../assets/bg.png') repeat;
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

.str-right-mouse {
  font-family: 'Microsoft YaHei', sans-serif; /* 使用微软雅黑字体 */
  color: #000000;
  font-size: 16px;
  line-height: 1.5; /* 行高为 1.5 */
  text-shadow:
    -1px -1px 0 #fff,
    1px -1px 0 #fff,
    -1px 1px 0 #fff,
    1px 1px 0 #fff;
  font-weight: bold; /* 加粗文字 */
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  padding: 24px;
  text-align: center;
}

.image-error-content {
  max-width: 100%;
  line-height: 1.5;
}

.image-error-title {
  font-size: 18px;
  font-weight: 600;
}

.image-error-label {
  margin-top: 12px;
  color: #d6d6d6;
}

.image-error-path {
  margin-top: 4px;
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>

<template>
  <section class="canvas-workspace">
    <div
      ref="imgContainerRef"
      class="image-container"
      @mouseenter="mouseEntered"
      @mouseleave="mouseLeft"
      @wheel.prevent="onWheel"
    >
      <canvas
        ref="canvas"
        class="canvas-layer"
        :width="viewportWidth"
        :height="viewportHeight"
        @click="toggleDot"
        @mousemove="updateZoomView"
      ></canvas>
      <canvas
        ref="canvasForShowQuads"
        class="canvas-layer quad-layer"
        :width="viewportWidth"
        :height="viewportHeight"
      ></canvas>

      <div v-if="isLoading" class="loading-overlay">正在加载图片…</div>
      <div v-else-if="imageLoadError" class="loading-overlay">
        <div class="image-error-content">
          <div class="image-error-title">图片加载失败</div>
          <div class="image-error-label">路径</div>
          <div class="image-error-path">{{ imageLoadError.path || '未知路径' }}</div>
        </div>
      </div>
      <div v-else-if="!canInteract" class="empty-image-state">请先在“图集与图片”页打开图集</div>

      <div
        v-if="indices2Show"
        class="str-right-mouse"
        :style="{ top: `${mouseCoord.y - 24}px`, left: `${mouseCoord.x + 8}px` }"
      >
        {{ indices2Show }}
      </div>
      <div
        v-if="hoveredPixelCanvasCoord"
        class="hovered-pixel"
        :style="{
          top: `${hoveredPixelCanvasCoord.y}px`,
          left: `${hoveredPixelCanvasCoord.x}px`,
          width: `${scale}px`,
          height: `${scale}px`,
        }"
      ></div>
      <div
        v-for="(dot, index) in dotsCanvasCoord"
        :key="`${index}-${dot.x}-${dot.y}`"
        class="dot-marker"
        :style="{
          top: `${dot.y}px`,
          left: `${dot.x}px`,
          width: markerHitSize,
          height: markerHitSize,
        }"
        :aria-label="`删除点 P${index + 1}`"
        @click.stop="deleteDot(index)"
      >
        <span class="dot-pixel" :style="{ transform: `scale(${scale})` }"></span>
        <span class="dot-label">P{{ index + 1 }}</span>
      </div>
      <div
        v-show="scale < gridLimit"
        ref="zoomRectangle"
        class="rectangle"
        :style="{ transform: `scale(${scale})` }"
      ></div>
    </div>

    <div class="canvas-scale-bar">
      <span class="scale-label">缩放</span>
      <input
        :value="scaleDisplayValue"
        class="scale-number"
        type="number"
        min="0.1"
        :max="scaleRange"
        step="0.1"
        :disabled="!canInteract"
        aria-label="图片缩放比例"
        @change="applyScaleInput"
      />
      <div class="scale-slider-control">
        <input
          :value="scaleSliderPosition"
          class="scale-range"
          type="range"
          min="0"
          :max="scaleSliderRange"
          step="0.1"
          :disabled="!canInteract"
          aria-label="按对数刻度调整图片缩放比例"
          @input="applyScaleSliderInput"
        />
        <div class="scale-ticks" aria-hidden="true">
          <span v-for="tick in scaleTicks" :key="tick.value" :style="{ left: `${tick.position}%` }">
            {{ tick.label }}
          </span>
        </div>
      </div>
      <span class="scale-value">{{ scaleDisplayValue }}×</span>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useMouse, useMousePressed, useResizeObserver } from '@vueuse/core';
import { getOuterInnerQuads, drawPath } from '../utils/ImageProcess.js';
import {
  calculatePixelFocusTransform,
  calculateQuadFocusTransform,
  calculateWheelScale,
  canvasToImagePoint,
  clientToLocalPoint,
  imageToCanvasPoint,
  imageToScaledPoint,
  normalizeScale,
  scaleToSliderPosition,
  scaledToCanvasPoint,
  scaledToImagePoint,
  sliderPositionToScale,
} from '../utils/ImageViewGeometry.js';

import { isPointInPolygon } from '../utils/BasicFuncs.js';

const emits = defineEmits(['update-zoom-view', 'output-message', 'update-selected-dots', 'select-quad-index']);

const props = defineProps({
  imageObj: {
    type: Object, // 指定类型为对象
    default: null, // 默认值为 null
  },
  canEdit: {
    type: Boolean,
    default: true,
  },
  canInteract: {
    type: Boolean,
    default: false,
  },
  isLoading: {
    type: Boolean,
    default: false,
  },
  activeQuadIndex: {
    type: Number,
    default: -1,
  },
  selectedDots: {
    type: Array,
    default: () => [],
  },
  imageLoadError: {
    type: Object,
    default: null,
  },
  hoverSelectMode: {
    type: Boolean,
    default: false,
  },
});

// Canvas and viewport state
const gridLimit = 10;
const scaleRange = 60;
const scaleSliderRange = 100;
const autoAdaptBorderDis = 10;
const imgContainerRef = ref(null);
const canvas = ref(null);
const canvasForShowQuads = ref(null);
const zoomRectangle = ref(null);
const ctx = ref(null);
const ctxQuad = ref(null);
const scale = ref(1);
const scaleSliderPosition = computed(() => scaleToSliderPosition(scale.value));
const scaleDisplayValue = computed(() => Number(scale.value.toFixed(scale.value < 10 ? 2 : 1)));
const scaleTicks = Object.freeze(
  [0.1, 1, 10, 60].map(value => ({
    value,
    label: `${value}×`,
    position: scaleToSliderPosition(value),
  })),
);
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

// Annotation state
const dotsCanvasCoord = ref([]);
const hoveredPixelCanvasCoord = ref(null);
const markerHitSize = computed(() => `${Math.max(scale.value, 8)}px`);
const realDot2GetZoom = ref({ x: -1, y: -1 });
let quadsArray = [];
const highlightQuadIndex = computed(() => props.activeQuadIndex);
const showQuadIndex = reactive([]);
const outerQuadArray = [];

// Interaction and feedback state
const mouseIsOverContainer = ref(false);
const mouseCoord = reactive({ x: 0, y: 0 });
const indices2Show = ref('');
let mouseMoved = false;
let timer = null;
let isNotLongPress = true;

defineExpose({
  resetPosition,
  initImgInfo,
  toggleShowQuadIndex,
  addShowQuadIndex,
  clearShowQuadIndex,
  resetQuadsArray,
  redrawQuadOverlay: drawCanvasForShowQuads,
  clearImage,
  focusQuad,
  focusPixelAtMouse,
});

function outputMessage(message) {
  emits('output-message', message);
}

function getLocalPoint(clientX, clientY) {
  const container = imgContainerRef.value;
  if (container === null) return null;
  return clientToLocalPoint({ x: clientX, y: clientY }, container.getBoundingClientRect(), {
    left: container.clientLeft,
    top: container.clientTop,
  });
}

function syncMouseCoord(clientX, clientY) {
  const localPoint = getLocalPoint(clientX, clientY);
  if (localPoint === null) return null;
  mouseCoord.x = localPoint.x;
  mouseCoord.y = localPoint.y;
  return localPoint;
}

// Point editing
function deletePt(ptIndex) {
  if (Number.isInteger(ptIndex) && ptIndex >= 0 && ptIndex < props.selectedDots.length) {
    const nextSelectedDots = props.selectedDots.map(dot => ({ ...dot }));
    nextSelectedDots.splice(ptIndex, 1);
    emits('update-selected-dots', nextSelectedDots);
    return true;
  }
  return false;
}

function deleteDot(index) {
  if (!props.canEdit) return;
  if (!deletePt(index)) {
    outputMessage('Error delete the pt in canvas!');
  }
}

function getDotInfo(e) {
  let canvasCoord = getLocalPoint(e.clientX, e.clientY);
  if (canvasCoord === null) return null;
  let realCoord = { x: 0, y: 0 };

  transCanvas2RealInfo(realCoord, canvasCoord); // 得到原始图片对应坐标
  transReal2CanvasInfo(canvasCoord, realCoord); // 得到贴合后画布确切坐标

  const existingDotIndex = props.selectedDots.findIndex(
    realDot => Math.abs(realDot.x - realCoord.x) < 2 && Math.abs(realDot.y - realCoord.y) < 2,
  );
  return { canvasCoord, realCoord, existingDotIndex };
}

// Base image rendering
function isImageOutsideViewport() {
  if (imageSrc === '' || scale.value <= 0 || initImgWidth.value <= 0 || initImgHeight.value <= 0) return false;
  return (
    offsetX.value >= viewportWidth.value ||
    offsetY.value >= viewportHeight.value ||
    offsetX.value <= -initImgWidth.value * scale.value ||
    offsetY.value <= -initImgHeight.value * scale.value
  );
}

function notifyIfImageBecameInvisible(wasOutsideViewport) {
  if (!wasOutsideViewport && isImageOutsideViewport()) outputMessage('The image is out of the visible area.');
}

function drawCanvas() {
  if (canvas.value === null || ctx.value === null || props.imageObj === null) {
    console.warn('Failed to draw the image canvas.');
    return false;
  }
  if (isImageOutsideViewport()) {
    ctx.value.clearRect(0, 0, canvas.value.width, canvas.value.height);
    return false;
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
    drawImgInGrid(sw, sh);
    drawGrid();
  }
  return true;
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
  initCanvasSettings();
  ctx.value.drawImage(
    props.imageObj,
    sourceLTCoord.x,
    sourceLTCoord.y,
    sourceWidth,
    sourceHeight,
    canvasLTCoord.x + 1,
    canvasLTCoord.y + 1,
    sourceWidth * space,
    sourceHeight * space,
  );
}

// Annotation overlay rendering
function isValidQuadPoints(quadPoints) {
  return (
    Array.isArray(quadPoints) &&
    quadPoints.length >= 4 &&
    quadPoints.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y))
  );
}

function resetQuadsArray(newQuadArray, coordinateScale, { deletedIndex = null, insertedIndex = null } = {}) {
  const scaleX = typeof coordinateScale === 'number' ? coordinateScale : coordinateScale?.x;
  const scaleY = typeof coordinateScale === 'number' ? coordinateScale : coordinateScale?.y;
  quadsArray = Array.isArray(newQuadArray)
    ? newQuadArray.map(quad => (Array.isArray(quad) ? quad.map(dot => ({ ...dot })) : quad))
    : [];
  quadsArray.forEach(quad => {
    if (!isValidQuadPoints(quad) || !Number.isFinite(scaleX) || !Number.isFinite(scaleY)) return;
    quad.forEach(dot => {
      dot.x = scaleX === 0 ? 0 : Math.round(dot.x * scaleX);
      dot.y = scaleY === 0 ? 0 : Math.round(dot.y * scaleY);
    });
  });

  if (Number.isInteger(deletedIndex) && deletedIndex >= 0) {
    const remappedIndices = showQuadIndex
      .filter(index => index !== deletedIndex)
      .map(index => (index > deletedIndex ? index - 1 : index))
      .filter(index => index >= 0 && index < quadsArray.length);
    showQuadIndex.splice(0, showQuadIndex.length, ...remappedIndices);
  } else if (Number.isInteger(insertedIndex) && insertedIndex >= 0) {
    const remappedIndices = showQuadIndex
      .map(index => (index >= insertedIndex ? index + 1 : index))
      .filter(index => index >= 0 && index < quadsArray.length);
    showQuadIndex.splice(0, showQuadIndex.length, ...remappedIndices);
  }
}

watch(highlightQuadIndex, (newHighlightQuadIndex, oldHighlightQuadIndex) => {
  if (oldHighlightQuadIndex === newHighlightQuadIndex) return;
  if (moveHighlightToEnd()) return;
  drawCanvasForShowQuads();
});

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
  updateHoveredQuadInfo();
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
  refreshZoomViewAtCurrentMouse();
}

function updateViewPortDraw() {
  if (imageSrc === '' || viewportDrawFrameId !== null) return;

  viewportDrawFrameId = requestAnimationFrame(() => {
    viewportDrawFrameId = null;
    drawViewPortNow();
  });
}

// Pan and zoom interaction
const { x, y } = useMouse();
const { pressed } = useMousePressed({ target: imgContainerRef });
watch([x, y], ([newX, newY], [oldX, oldY]) => {
  syncMouseCoord(newX, newY);
  if (newX !== oldX || newY !== oldY) mouseMoved = true;
  if (!props.canInteract) return;
  if (pressed.value) {
    updateOffsetMoved(oldX, oldY, newX, newY);
  } else {
    updateHoveredQuadInfo(true);
  }
});

const mouseEntered = event => {
  mouseIsOverContainer.value = true;
  syncMouseCoord(event.clientX, event.clientY);
};

const mouseLeft = () => {
  mouseIsOverContainer.value = false;
  hoveredPixelCanvasCoord.value = null;
};

function updateOffsetMoved(oldX, oldY, newX, newY) {
  const deltaX = newX - oldX;
  const deltaY = newY - oldY;
  if (deltaX === 0 && deltaY === 0) return;
  const wasOutsideViewport = isImageOutsideViewport();

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
  notifyIfImageBecameInvisible(wasOutsideViewport);
  updateViewPortDraw();
}

function updateHoveredQuadInfo(commitSelection = false) {
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

  if (commitSelection) emitHoveredQuadSelection(indices2Show.value, separator);
}

function emitHoveredQuadSelection(indicesArray, separator) {
  if (!props.hoverSelectMode) return;
  const indicesNumberArray = indicesArray.split(separator).map(Number);
  if (indicesNumberArray.length !== 1) {
    emits('select-quad-index', -1);
    return;
  }
  const targetIndex = indicesNumberArray[0] - 1;
  emits('select-quad-index', targetIndex);
}

function updateOffsetForPointerScale(oldScale, newScale) {
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

function applyUserScale(newScale, { anchorAtPointer = false } = {}) {
  const previousScale = normalizeScale(scale.value, 0.1, scaleRange, 1);
  const validScale = normalizeScale(newScale, 0.1, scaleRange, previousScale);
  if (Object.is(previousScale, validScale)) return;
  const wasOutsideViewport = isImageOutsideViewport();
  if (anchorAtPointer) updateOffsetForPointerScale(previousScale, validScale);
  scale.value = validScale;
  notifyIfImageBecameInvisible(wasOutsideViewport);
  updateViewPortDraw();
}

function applyScaleInput(event) {
  applyUserScale(event.target.value);
  event.target.value = scaleDisplayValue.value;
}

function applyScaleSliderInput(event) {
  const sliderPosition = Number(event.target.value);
  let nextScale = sliderPositionToScale(sliderPosition);
  const gridPosition = scaleToSliderPosition(gridLimit);
  if (Math.abs(sliderPosition - gridPosition) <= 0.75) nextScale = gridLimit;
  applyUserScale(nextScale);
  event.target.value = scaleToSliderPosition(nextScale);
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

// Component lifecycle
useResizeObserver(imgContainerRef, () => {
  void updateViewSize();
});

onMounted(() => {
  void updateViewSize();
});

onUnmounted(() => {
  cancelScheduledViewPortDraw();
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
});

// Point selection
function isPointInVisibleImage(canvasPoint) {
  return (
    canvasPoint.x >= canvasLTCoord.x &&
    canvasPoint.x < canvasRBCoord.x &&
    canvasPoint.y >= canvasLTCoord.y &&
    canvasPoint.y < canvasRBCoord.y
  );
}

watch(
  () => props.selectedDots,
  () => updateDotsCanvasCoord(),
  { deep: true },
);

function toggleDot(e) {
  if (!props.canEdit || imageSrc === '' || !isNotLongPress) {
    return;
  }

  const localPoint = getLocalPoint(e.clientX, e.clientY);
  if (localPoint === null || !isPointInVisibleImage(localPoint)) {
    outputMessage('The pt is not in the pic.');
    return;
  }

  const dotInfo = getDotInfo(e);
  if (dotInfo === null) return;
  const { realCoord, existingDotIndex } = dotInfo;
  if (existingDotIndex !== -1) {
    deletePt(existingDotIndex);
    outputMessage('Delete the pt.');
  } else if (props.selectedDots.length >= 4) {
    outputMessage('Already set 4 pts.');
  } else {
    emits('update-selected-dots', [...props.selectedDots.map(dot => ({ ...dot })), { x: realCoord.x, y: realCoord.y }]);
  }
}

function resetPosition() {
  offsetX.value = 0;
  offsetY.value = 0;
  updateViewPortDraw();
}

function applyViewTransform(transform) {
  cancelScheduledViewPortDraw();
  scale.value = transform.scale;
  offsetX.value = transform.offsetX;
  offsetY.value = transform.offsetY;
  drawViewPortNow();
}

function focusQuad(quadIndex) {
  if (imageSrc === '') return { success: false, error: 'No image is available.' };
  if (!Number.isInteger(quadIndex) || quadIndex < 0 || quadIndex >= quadsArray.length) {
    return { success: false, error: 'No active Quad is available.' };
  }

  const transform = calculateQuadFocusTransform(quadsArray[quadIndex], {
    viewportWidth: viewportWidth.value,
    viewportHeight: viewportHeight.value,
  });
  if (transform === null) return { success: false, error: 'The active Quad has invalid coordinates.' };

  applyViewTransform(transform);
  return { success: true };
}

function focusPixelAtMouse() {
  if (!props.canInteract || imageSrc === '') return { success: false, error: 'No image is available.' };

  syncMouseCoord(x.value, y.value);
  const mousePoint = { x: mouseCoord.x, y: mouseCoord.y };
  if (!mouseIsOverContainer.value || !isPointInVisibleImage(mousePoint)) {
    return { success: false, error: 'Please move the mouse over a visible image pixel before focusing it.' };
  }

  const imagePoint = { x: 0, y: 0 };
  transCanvas2RealInfo(imagePoint, mousePoint);
  if (
    imagePoint.x < 0 ||
    imagePoint.x >= initImgWidth.value ||
    imagePoint.y < 0 ||
    imagePoint.y >= initImgHeight.value
  ) {
    return { success: false, error: 'The pixel under the mouse is outside the image.' };
  }

  const transform = calculatePixelFocusTransform(imagePoint, {
    viewportWidth: viewportWidth.value,
    viewportHeight: viewportHeight.value,
  });
  if (transform === null) return { success: false, error: 'Failed to calculate the pixel focus position.' };

  applyViewTransform(transform);
  return { success: true };
}

function clearDots() {
  dotsCanvasCoord.value = [];
  emits('update-selected-dots', []);
}

// Image lifecycle
function resetViewportGeometry() {
  offsetX.value = 0;
  offsetY.value = 0;
  Object.assign(canvasLTCoord, { x: 0, y: 0 });
  Object.assign(canvasRBCoord, { x: 0, y: 0 });
  Object.assign(sourceLTCoord, { x: 0, y: 0 });
  Object.assign(sourceRBCoord, { x: 0, y: 0 });
}

function resetAnnotationOverlay() {
  quadsArray = [];
  showQuadIndex.splice(0, showQuadIndex.length);
  outerQuadArray.splice(0, outerQuadArray.length);
  indices2Show.value = '';
}

function clearImage() {
  cancelScheduledViewPortDraw();
  imageSrc = '';
  initImgWidth.value = 0;
  initImgHeight.value = 0;
  scale.value = 0;
  resetViewportGeometry();
  resetAnnotationOverlay();
  realDot2GetZoom.value = { x: -1, y: -1 };
  hoveredPixelCanvasCoord.value = null;

  if (ctx.value !== null) {
    ctx.value.clearRect(0, 0, ctx.value.canvas.width, ctx.value.canvas.height);
  }
  if (ctxQuad.value !== null) {
    ctxQuad.value.clearRect(0, 0, ctxQuad.value.canvas.width, ctxQuad.value.canvas.height);
  }
}

async function initImgInfo() {
  cancelScheduledViewPortDraw();
  scale.value = 0;
  resetViewportGeometry();
  resetAnnotationOverlay();
  clearDots();
  try {
    if (!props.imageObj?.src) {
      console.warn('Failed to initialize image: the image source is unavailable.');
      return false;
    }

    imageSrc = props.imageObj.src;
    const img = props.imageObj;
    initImgWidth.value = img.naturalWidth || img.width;
    initImgHeight.value = img.naturalHeight || img.height;
    if (ctx.value !== null) {
      ctx.value.clearRect(0, 0, ctx.value.canvas.width, ctx.value.canvas.height);
    }
    if (ctxQuad.value !== null) {
      ctxQuad.value.clearRect(0, 0, ctxQuad.value.canvas.width, ctxQuad.value.canvas.height);
    }
    ctx.value = canvas.value.getContext('2d');
    ctxQuad.value = canvasForShowQuads.value.getContext('2d');
    const scaleValue = Math.min(viewportWidth.value / img.width, viewportHeight.value / img.height);
    scale.value = normalizeScale(scaleValue, 0.1, scaleRange, 1);
    drawViewPortNow();
    await nextTick();
    return true;
  } catch (error) {
    console.error('Error in event handler:', error);
    return false;
  }
}
const onWheel = event => {
  if (!props.canInteract) {
    return;
  }
  if (syncMouseCoord(event.clientX, event.clientY) === null) return;
  applyUserScale(calculateWheelScale(scale.value, event.deltaY, { gridLimit }), { anchorAtPointer: true });
};

// Zoom preview and point positions
function refreshZoomViewAtCurrentMouse() {
  if (!mouseIsOverContainer.value) return;
  updateZoomView({ clientX: x.value, clientY: y.value });
}

function updateZoomView(e) {
  if (!props.canInteract || !props.imageObj || imageSrc === '') {
    return;
  }
  const localPoint = syncMouseCoord(e.clientX, e.clientY);
  if (localPoint === null) return;
  updateHoveredPixel(localPoint);
  let rectCoord = updateRealDots2GetZoom(localPoint);
  if (rectCoord) {
    updateRectanglePosition(rectCoord);
    emits('update-zoom-view', { ...realDot2GetZoom.value });
  }
}

function updateHoveredPixel(localPoint) {
  if (scale.value < gridLimit || !isPointInVisibleImage(localPoint)) {
    hoveredPixelCanvasCoord.value = null;
    return;
  }

  const imagePoint = { x: 0, y: 0 };
  transCanvas2RealInfo(imagePoint, localPoint);
  if (
    imagePoint.x < sourceLTCoord.x ||
    imagePoint.x > sourceRBCoord.x ||
    imagePoint.y < sourceLTCoord.y ||
    imagePoint.y > sourceRBCoord.y
  ) {
    hoveredPixelCanvasCoord.value = null;
    return;
  }

  const canvasPoint = { x: 0, y: 0 };
  transReal2CanvasInfo(canvasPoint, imagePoint);
  hoveredPixelCanvasCoord.value = { x: canvasPoint.x + 1, y: canvasPoint.y + 1 };
}

function updateRealDots2GetZoom(localPoint) {
  if (imageSrc === '') return;

  let canvasCoord = { ...localPoint };
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
  dotsCanvasCoord.value = props.selectedDots.map(realDot => {
    const canvasDot = { x: 0, y: 0 };
    transReal2CanvasInfo(canvasDot, realDot);
    if (scale.value >= gridLimit) {
      canvasDot.x += 1;
      canvasDot.y += 1;
    }
    return canvasDot;
  });
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
    canvasOffsetLeft: 0,
    canvasOffsetTop: 0,
  };
}

function updateRectanglePosition(rectCoord) {
  if (scale.value >= gridLimit) {
    return;
  }
  const rectangle = zoomRectangle.value;
  if (rectangle === null) return;

  rectangle.style.left = rectCoord.x + 'px';
  rectangle.style.top = rectCoord.y + 'px';
}

// Canvas sizing and loading feedback
async function updateViewSize() {
  if (imgContainerRef.value) {
    viewportWidth.value = imgContainerRef.value.clientWidth;
    viewportHeight.value = imgContainerRef.value.clientHeight;
    await nextTick();

    initCanvasSettings();
    updateViewPortDraw();
  }
}

function initCanvasSettings() {
  if (canvas.value === null) return;
  if (ctx.value === null) {
    ctx.value = canvas.value.getContext('2d');
  }

  ctx.value.imageSmoothingEnabled = false;
  ctx.value.mozImageSmoothingEnabled = false;
  ctx.value.webkitImageSmoothingEnabled = false;
  ctx.value.msImageSmoothingEnabled = false;
}
</script>

<style scoped>
.canvas-workspace {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--border-subtle, #dce1e8);
  border-radius: 10px;
  background: var(--surface-raised, #ffffff);
  box-shadow: 0 5px 18px rgba(37, 48, 65, 0.06);
}

.image-container {
  position: relative;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: url('../assets/bg.png') repeat;
  cursor: default;
}

.canvas-layer {
  position: absolute;
  inset: 0;
}

.quad-layer {
  pointer-events: none;
}

.hovered-pixel {
  position: absolute;
  z-index: 6;
  box-sizing: border-box;
  border: 2px solid #ffffff;
  outline: 2px solid #101828;
  background: rgba(255, 255, 255, 0.1);
  pointer-events: none;
}

.dot-marker {
  position: absolute;
  z-index: 7;
  cursor: pointer;
}

.dot-pixel {
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  transform-origin: 0 0;
  background: #ff2d55;
  box-shadow: inset 0 0 0 0.1px rgba(255, 255, 255, 0.9);
  pointer-events: none;
}

.dot-label {
  position: absolute;
  top: -20px;
  left: 0;
  min-width: 24px;
  padding: 3px 5px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 5px;
  background: #ff2d55;
  color: white;
  font: 700 10px/1 var(--font-ui, sans-serif);
  text-align: center;
  box-shadow: 0 2px 7px rgba(28, 36, 48, 0.28);
  cursor: pointer;
}

.dot-label::after {
  position: absolute;
  bottom: -4px;
  left: 5px;
  width: 0;
  height: 0;
  border-top: 4px solid #ff2d55;
  border-right: 4px solid transparent;
  border-left: 4px solid transparent;
  content: '';
}

.rectangle {
  position: absolute;
  z-index: 4;
  width: 8px;
  height: 8px;
  border: 1px solid rgba(255, 0, 0, 0.5);
  background-color: transparent;
  pointer-events: none;
  transform-origin: 0 0;
}

.str-right-mouse {
  position: absolute;
  z-index: 7;
  padding: 2px 6px;
  border: 1px solid rgba(15, 23, 42, 0.14);
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.92);
  color: #0f172a;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  pointer-events: none;
}

.loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 8;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  background-color: rgba(15, 23, 42, 0.68);
  color: white;
  text-align: center;
}

.empty-image-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  font-size: 14px;
  pointer-events: none;
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

.canvas-scale-bar {
  display: grid;
  grid-template-columns: 36px 68px minmax(120px, 1fr) 52px;
  min-height: 56px;
  align-items: center;
  gap: 10px;
  padding: 7px 12px;
  border-top: 1px solid var(--border-subtle, #dce1e8);
  background: var(--surface-raised, #ffffff);
}

.scale-label,
.scale-value {
  color: var(--text-secondary, #5b6675);
  font-size: 12px;
}

.scale-value {
  width: 52px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

.scale-number {
  width: 68px;
  padding: 5px 7px;
  border: 1px solid var(--border-strong, #c7ced8);
  border-radius: 6px;
  background: var(--surface-muted, #f7f8fa);
  color: var(--text-primary, #1c2430);
  font: 12px var(--font-mono, monospace);
}

.scale-range {
  display: block;
  width: 100%;
  min-width: 80px;
  margin: 0;
  accent-color: var(--accent, #2f6fed);
}

.scale-slider-control {
  position: relative;
  width: 100%;
  min-width: 120px;
  padding-bottom: 15px;
}

.scale-ticks {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  height: 12px;
  color: var(--text-muted, #8a94a3);
  font: 9px/1 var(--font-mono, monospace);
  pointer-events: none;
}

.scale-ticks span {
  position: absolute;
  transform: translateX(-50%);
  white-space: nowrap;
}

.scale-ticks span:first-child {
  transform: none;
}

.scale-ticks span:last-child {
  transform: translateX(-100%);
}

.scale-number:disabled,
.scale-range:disabled {
  opacity: 0.5;
}
</style>

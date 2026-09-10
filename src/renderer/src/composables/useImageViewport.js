import { computed, reactive, ref } from 'vue';
import {
  calculateFitScale,
  calculatePointerAnchoredOffset,
  calculateSnappedPanOffset,
  calculateVisibleImageAxis,
  canvasToImagePoint,
  getRenderedImageSize,
  getRenderedPixelPitch,
  imageToCanvasPoint,
  normalizeScale,
} from '../utils/ImageViewGeometry.js';

export function useImageViewport({ gridLimit = 10, scaleRange = 60, snapDistance = 10 } = {}) {
  const scale = ref(1);
  const offsetX = ref(0);
  const offsetY = ref(0);
  const viewportWidth = ref(0);
  const viewportHeight = ref(0);
  const imageWidth = ref(0);
  const imageHeight = ref(0);
  const canvasLeftTop = reactive({ x: 0, y: 0 });
  const canvasRightBottom = reactive({ x: 0, y: 0 });
  const sourceLeftTop = reactive({ x: 0, y: 0 });
  const sourceRightBottom = reactive({ x: 0, y: 0 });
  const pixelPitch = computed(() => getRenderedPixelPitch(scale.value, gridLimit));
  const renderedWidth = computed(() => getRenderedImageSize(imageWidth.value, scale.value, gridLimit));
  const renderedHeight = computed(() => getRenderedImageSize(imageHeight.value, scale.value, gridLimit));
  let rawOffsetX = 0;
  let rawOffsetY = 0;
  let panGestureActive = false;

  function resetVisibleRegion() {
    Object.assign(canvasLeftTop, { x: 0, y: 0 });
    Object.assign(canvasRightBottom, { x: 0, y: 0 });
    Object.assign(sourceLeftTop, { x: 0, y: 0 });
    Object.assign(sourceRightBottom, { x: 0, y: 0 });
  }

  function resetPosition() {
    offsetX.value = 0;
    offsetY.value = 0;
    rawOffsetX = 0;
    rawOffsetY = 0;
    panGestureActive = false;
  }

  function clear() {
    scale.value = 0;
    imageWidth.value = 0;
    imageHeight.value = 0;
    resetPosition();
    resetVisibleRegion();
  }

  function setViewportSize(width, height) {
    viewportWidth.value = Number.isFinite(width) && width > 0 ? width : 0;
    viewportHeight.value = Number.isFinite(height) && height > 0 ? height : 0;
  }

  function setImageSize(width, height) {
    imageWidth.value = Number.isSafeInteger(width) && width > 0 ? width : 0;
    imageHeight.value = Number.isSafeInteger(height) && height > 0 ? height : 0;
  }

  function fitImageToViewport() {
    const fitScale = calculateFitScale(
      { width: imageWidth.value, height: imageHeight.value },
      { width: viewportWidth.value, height: viewportHeight.value },
      { maximumScale: scaleRange, gridLimit },
    );
    scale.value = fitScale ?? 1;
    return fitScale !== null;
  }

  function isImageOutsideViewport(hasImage = true) {
    if (!hasImage || scale.value <= 0 || imageWidth.value <= 0 || imageHeight.value <= 0) return false;
    return (
      offsetX.value >= viewportWidth.value ||
      offsetY.value >= viewportHeight.value ||
      offsetX.value + renderedWidth.value <= 0 ||
      offsetY.value + renderedHeight.value <= 0
    );
  }

  function updateVisibleRegion() {
    const horizontalRegion = calculateVisibleImageAxis(
      imageWidth.value,
      viewportWidth.value,
      offsetX.value,
      scale.value,
      gridLimit,
    );
    const verticalRegion = calculateVisibleImageAxis(
      imageHeight.value,
      viewportHeight.value,
      offsetY.value,
      scale.value,
      gridLimit,
    );
    if (horizontalRegion === null || verticalRegion === null) {
      resetVisibleRegion();
      return null;
    }

    Object.assign(sourceLeftTop, { x: horizontalRegion.sourceStart, y: verticalRegion.sourceStart });
    Object.assign(sourceRightBottom, { x: horizontalRegion.sourceEnd, y: verticalRegion.sourceEnd });
    Object.assign(canvasLeftTop, { x: horizontalRegion.canvasStart, y: verticalRegion.canvasStart });
    Object.assign(canvasRightBottom, { x: horizontalRegion.canvasEnd, y: verticalRegion.canvasEnd });
    return {
      sourceWidth: horizontalRegion.sourceSize,
      sourceHeight: verticalRegion.sourceSize,
      canvasWidth: horizontalRegion.canvasEnd - horizontalRegion.canvasStart,
      canvasHeight: verticalRegion.canvasEnd - verticalRegion.canvasStart,
    };
  }

  function beginPanGesture() {
    rawOffsetX = offsetX.value;
    rawOffsetY = offsetY.value;
    panGestureActive = true;
  }

  function endPanGesture() {
    panGestureActive = false;
  }

  function panBy(deltaX, deltaY, { hasImage = true } = {}) {
    if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY) || (deltaX === 0 && deltaY === 0)) {
      return { changed: false, becameInvisible: false };
    }
    const wasOutsideViewport = isImageOutsideViewport(hasImage);
    if (!panGestureActive) beginPanGesture();

    if (!hasImage) {
      rawOffsetX += deltaX;
      rawOffsetY += deltaY;
      offsetX.value = rawOffsetX;
      offsetY.value = rawOffsetY;
    } else {
      const horizontalPan = calculateSnappedPanOffset(rawOffsetX, offsetX.value, deltaX, {
        leadingBoundary: 0,
        trailingBoundary: viewportWidth.value - renderedWidth.value,
        snapDistance,
      });
      const verticalPan = calculateSnappedPanOffset(rawOffsetY, offsetY.value, deltaY, {
        leadingBoundary: 0,
        trailingBoundary: viewportHeight.value - renderedHeight.value,
        snapDistance,
      });
      rawOffsetX = horizontalPan.rawOffset;
      rawOffsetY = verticalPan.rawOffset;
      offsetX.value = horizontalPan.renderedOffset;
      offsetY.value = verticalPan.renderedOffset;
    }

    return {
      changed: true,
      becameInvisible: !wasOutsideViewport && isImageOutsideViewport(hasImage),
    };
  }

  function isPointInRenderedImage(point, targetScale = scale.value) {
    const width = getRenderedImageSize(imageWidth.value, targetScale, gridLimit);
    const height = getRenderedImageSize(imageHeight.value, targetScale, gridLimit);
    return (
      point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.x >= offsetX.value &&
      point.x < offsetX.value + width &&
      point.y >= offsetY.value &&
      point.y < offsetY.value + height
    );
  }

  function updateScale(newScale, { anchorPoint = null, hasImage = true } = {}) {
    const previousScale = normalizeScale(scale.value, 0.1, scaleRange, 1);
    const validScale = normalizeScale(newScale, 0.1, scaleRange, previousScale);
    if (Object.is(previousScale, validScale)) {
      return { changed: false, becameInvisible: false };
    }

    const wasOutsideViewport = isImageOutsideViewport(hasImage);
    if (anchorPoint !== null && isPointInRenderedImage(anchorPoint, previousScale)) {
      offsetX.value = calculatePointerAnchoredOffset(
        anchorPoint.x,
        offsetX.value,
        previousScale,
        validScale,
        gridLimit,
      );
      offsetY.value = calculatePointerAnchoredOffset(
        anchorPoint.y,
        offsetY.value,
        previousScale,
        validScale,
        gridLimit,
      );
    }
    scale.value = validScale;
    return {
      changed: true,
      becameInvisible: !wasOutsideViewport && isImageOutsideViewport(hasImage),
    };
  }

  function applyTransform(transform) {
    scale.value = transform.scale;
    offsetX.value = transform.offsetX;
    offsetY.value = transform.offsetY;
  }

  function imageToCanvas(point, targetScale = scale.value) {
    return imageToCanvasPoint(point, {
      scale: targetScale,
      gridLimit,
      offsetX: offsetX.value,
      offsetY: offsetY.value,
      canvasOffsetLeft: 0,
      canvasOffsetTop: 0,
    });
  }

  function canvasToImage(point, targetScale = scale.value) {
    return canvasToImagePoint(point, {
      scale: targetScale,
      gridLimit,
      offsetX: offsetX.value,
      offsetY: offsetY.value,
      canvasOffsetLeft: 0,
      canvasOffsetTop: 0,
    });
  }

  function isPointInVisibleImage(point) {
    return (
      point &&
      Number.isFinite(point.x) &&
      Number.isFinite(point.y) &&
      point.x >= canvasLeftTop.x &&
      point.x < canvasRightBottom.x &&
      point.y >= canvasLeftTop.y &&
      point.y < canvasRightBottom.y
    );
  }

  return {
    scale,
    offsetX,
    offsetY,
    viewportWidth,
    viewportHeight,
    imageWidth,
    imageHeight,
    canvasLeftTop,
    canvasRightBottom,
    sourceLeftTop,
    sourceRightBottom,
    pixelPitch,
    renderedWidth,
    renderedHeight,
    setViewportSize,
    setImageSize,
    fitImageToViewport,
    isImageOutsideViewport,
    updateVisibleRegion,
    beginPanGesture,
    endPanGesture,
    panBy,
    updateScale,
    applyTransform,
    imageToCanvas,
    canvasToImage,
    isPointInVisibleImage,
    resetPosition,
    clear,
  };
}

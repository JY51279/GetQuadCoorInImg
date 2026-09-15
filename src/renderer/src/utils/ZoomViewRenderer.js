import { getCanvasBackingLength, normalizeDevicePixelRatio } from './CanvasDisplay.js';

const ZOOM_SOURCE_SIZE = 6;
const ZOOM_CANVAS_SIZE = 120;
const ZOOM_CELL_SIZE = ZOOM_CANVAS_SIZE / ZOOM_SOURCE_SIZE;
const ZOOM_CENTER_INDEX = 3;

function getZoomContext(canvas) {
  const context = canvas?.getContext('2d');
  if (context == null) throw new Error('无法创建像素预览画布。');
  return context;
}

export function configureZoomCanvas(canvas, pixelRatio = 1) {
  const normalizedPixelRatio = normalizeDevicePixelRatio(pixelRatio);
  const backingSize = getCanvasBackingLength(ZOOM_CANVAS_SIZE, normalizedPixelRatio);
  canvas.width = backingSize;
  canvas.height = backingSize;
  if (canvas.style) {
    canvas.style.width = `${ZOOM_CANVAS_SIZE}px`;
    canvas.style.height = `${ZOOM_CANVAS_SIZE}px`;
  }
  const context = getZoomContext(canvas);
  context.setTransform?.(normalizedPixelRatio, 0, 0, normalizedPixelRatio, 0, 0);
  context.imageSmoothingEnabled = false;
  context.mozImageSmoothingEnabled = false;
  context.webkitImageSmoothingEnabled = false;
  context.msImageSmoothingEnabled = false;
  return normalizedPixelRatio;
}

function drawDot(context, point, origin) {
  const offsetX = point.x - origin.x;
  const offsetY = point.y - origin.y;
  if (offsetX < 0 || offsetX >= ZOOM_SOURCE_SIZE || offsetY < 0 || offsetY >= ZOOM_SOURCE_SIZE) return;

  context.fillRect(offsetX * ZOOM_CELL_SIZE, offsetY * ZOOM_CELL_SIZE, ZOOM_CELL_SIZE, ZOOM_CELL_SIZE);
}

function drawCenterMarker(context) {
  const markerStart = ZOOM_CENTER_INDEX * ZOOM_CELL_SIZE;
  const markerCenter = markerStart + ZOOM_CELL_SIZE / 2;
  const markerInset = ZOOM_CELL_SIZE / 4;

  context.lineWidth = 2;
  context.strokeStyle = 'blue';
  context.strokeRect(markerStart, markerStart, ZOOM_CELL_SIZE, ZOOM_CELL_SIZE);

  context.strokeStyle = 'red';
  context.beginPath();
  context.moveTo(markerStart + markerInset, markerCenter);
  context.lineTo(markerStart + ZOOM_CELL_SIZE - markerInset, markerCenter);
  context.moveTo(markerCenter, markerStart + markerInset);
  context.lineTo(markerCenter, markerStart + ZOOM_CELL_SIZE - markerInset);
  context.stroke();
}

export function drawZoomPreview(canvas, image, origin, points) {
  const context = getZoomContext(canvas);
  context.drawImage(
    image,
    origin.x,
    origin.y,
    ZOOM_SOURCE_SIZE,
    ZOOM_SOURCE_SIZE,
    0,
    0,
    ZOOM_CANVAS_SIZE,
    ZOOM_CANVAS_SIZE,
  );

  context.fillStyle = 'rgb(255,0,0)';
  points.forEach(point => drawDot(context, point, origin));
  drawCenterMarker(context);
}

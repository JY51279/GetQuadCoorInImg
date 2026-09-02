const ZOOM_SOURCE_SIZE = 6;
const ZOOM_CANVAS_SIZE = 120;
const ZOOM_CELL_SIZE = ZOOM_CANVAS_SIZE / ZOOM_SOURCE_SIZE;
const ZOOM_CENTER_INDEX = 3;

function getZoomContext(canvas) {
  const context = canvas?.getContext('2d');
  if (context == null) throw new Error('Failed to create the zoom canvas context.');
  return context;
}

export function configureZoomCanvas(canvas) {
  const context = getZoomContext(canvas);
  context.imageSmoothingEnabled = false;
  context.mozImageSmoothingEnabled = false;
  context.webkitImageSmoothingEnabled = false;
  context.msImageSmoothingEnabled = false;
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

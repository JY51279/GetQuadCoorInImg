export function scaledToImagePoint(scaledPoint, scale) {
  return {
    x: Math.floor(scaledPoint.x / scale),
    y: Math.floor(scaledPoint.y / scale),
  };
}

export function imageToScaledPoint(imagePoint, scale) {
  return {
    x: imagePoint.x * scale,
    y: imagePoint.y * scale,
  };
}

export function imageToCanvasPoint(
  imagePoint,
  { scale, gridLimit, sourceLeftTop, offsetX, offsetY, canvasOffsetLeft, canvasOffsetTop },
) {
  const gridOffsetX = scale >= gridLimit ? imagePoint.x - sourceLeftTop.x : 0;
  const gridOffsetY = scale >= gridLimit ? imagePoint.y - sourceLeftTop.y : 0;

  return {
    x: imagePoint.x * scale + gridOffsetX + offsetX + canvasOffsetLeft,
    y: imagePoint.y * scale + gridOffsetY + offsetY + canvasOffsetTop,
  };
}

export function scaledToCanvasPoint(scaledPoint, transform) {
  if (transform.scale >= transform.gridLimit) {
    return imageToCanvasPoint(scaledToImagePoint(scaledPoint, transform.scale), transform);
  }

  return {
    x: scaledPoint.x + transform.offsetX + transform.canvasOffsetLeft,
    y: scaledPoint.y + transform.offsetY + transform.canvasOffsetTop,
  };
}

export function canvasToImagePoint(
  canvasPoint,
  { scale, gridLimit, canvasLeftTop, offsetX, offsetY, canvasOffsetLeft, canvasOffsetTop },
) {
  let gridOffsetX = 0;
  let gridOffsetY = 0;
  if (scale >= gridLimit) {
    const gridX = (canvasPoint.x - canvasLeftTop.x) / (scale + 1);
    const gridY = (canvasPoint.y - canvasLeftTop.y) / (scale + 1);
    gridOffsetX = Number.isInteger(gridX) ? gridX : Math.floor(gridX) + 1;
    gridOffsetY = Number.isInteger(gridY) ? gridY : Math.floor(gridY) + 1;
  }

  return {
    x: Math.floor((canvasPoint.x - gridOffsetX - offsetX - canvasOffsetLeft) / scale),
    y: Math.floor((canvasPoint.y - gridOffsetY - offsetY - canvasOffsetTop) / scale),
  };
}

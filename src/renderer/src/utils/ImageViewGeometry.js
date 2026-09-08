export function normalizeScale(value, minimum = 0.1, maximum = 60, fallback = 1) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(maximum, Math.max(minimum, numericValue));
}

function getFocusScale(visualPixelSize, gridLimit, minimumScale, maximumScale) {
  let scale = visualPixelSize;
  if (visualPixelSize >= gridLimit + 1) {
    scale = visualPixelSize - 1;
  } else if (visualPixelSize >= gridLimit) {
    scale = gridLimit - 0.1;
  }
  return normalizeScale(scale, minimumScale, maximumScale, 1);
}

function getCenteredOffset(center, viewportSize, scale, gridLimit) {
  if (scale < gridLimit) return viewportSize / 2 - center * scale;

  // Grid spacing depends on the first visible source pixel. Resolve that
  // discrete offset in memory so focusing still needs only one canvas draw.
  let offset = viewportSize / 2 - center * (scale + 1);
  for (let iteration = 0; iteration < 8; iteration++) {
    const sourceStart = Math.floor(Math.max(0, -offset) / scale);
    const nextOffset = viewportSize / 2 - center * scale - (center - sourceStart);
    if (Math.abs(nextOffset - offset) < 0.01) return nextOffset;
    offset = nextOffset;
  }
  return offset;
}

export function calculateQuadFocusTransform(
  quadPoints,
  { viewportWidth, viewportHeight },
  {
    viewportRatio = 0.75,
    paddingRatio = 0.25,
    minimumPadding = 8,
    maximumPadding = 32,
    minimumScale = 0.1,
    maximumScale = 60,
    gridLimit = 10,
  } = {},
) {
  if (
    !Array.isArray(quadPoints) ||
    quadPoints.length < 4 ||
    !quadPoints.every(point => point && Number.isFinite(point.x) && Number.isFinite(point.y)) ||
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0 ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0
  ) {
    return null;
  }

  const xValues = quadPoints.map(point => point.x);
  const yValues = quadPoints.map(point => point.y);
  const left = Math.min(...xValues);
  const right = Math.max(...xValues);
  const top = Math.min(...yValues);
  const bottom = Math.max(...yValues);
  // Quad coordinates identify pixel cells. The rendered outer edge therefore
  // extends one source pixel beyond the largest x/y coordinate.
  const rightEdge = right + 1;
  const bottomEdge = bottom + 1;
  const quadWidth = Math.max(1, rightEdge - left);
  const quadHeight = Math.max(1, bottomEdge - top);
  const padding = Math.min(
    maximumPadding,
    Math.max(minimumPadding, Math.ceil(Math.max(quadWidth, quadHeight) * paddingRatio)),
  );
  const focusWidth = quadWidth + padding * 2;
  const focusHeight = quadHeight + padding * 2;
  const visualPixelSize = Math.min(
    (viewportWidth * viewportRatio) / focusWidth,
    (viewportHeight * viewportRatio) / focusHeight,
  );
  const scale = getFocusScale(visualPixelSize, gridLimit, minimumScale, maximumScale);
  const centerX = (left + rightEdge) / 2;
  const centerY = (top + bottomEdge) / 2;

  return {
    scale,
    offsetX: getCenteredOffset(centerX, viewportWidth, scale, gridLimit),
    offsetY: getCenteredOffset(centerY, viewportHeight, scale, gridLimit),
    focusBounds: {
      left: left - padding,
      right: rightEdge + padding,
      top: top - padding,
      bottom: bottomEdge + padding,
    },
  };
}

export function calculatePixelFocusTransform(
  imagePoint,
  { viewportWidth, viewportHeight },
  { visualPixelSize = 10, minimumScale = 0.1, maximumScale = 60, gridLimit = 10 } = {},
) {
  if (
    !imagePoint ||
    !Number.isFinite(imagePoint.x) ||
    !Number.isFinite(imagePoint.y) ||
    !Number.isFinite(viewportWidth) ||
    viewportWidth <= 0 ||
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    !Number.isFinite(visualPixelSize) ||
    visualPixelSize <= 0
  ) {
    return null;
  }

  const scale = getFocusScale(visualPixelSize, gridLimit, minimumScale, maximumScale);
  const centerX = imagePoint.x + 0.5;
  const centerY = imagePoint.y + 0.5;

  return {
    scale,
    offsetX: getCenteredOffset(centerX, viewportWidth, scale, gridLimit),
    offsetY: getCenteredOffset(centerY, viewportHeight, scale, gridLimit),
  };
}

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

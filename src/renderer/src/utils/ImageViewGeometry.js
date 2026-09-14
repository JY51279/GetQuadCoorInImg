export function normalizeScale(value, minimum = 0.1, maximum = 60, fallback = 1) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return fallback;
  return Math.min(maximum, Math.max(minimum, numericValue));
}

export function scaleToSliderPosition(
  scale,
  { minimumScale = 0.1, maximumScale = 60, minimumPosition = 0, maximumPosition = 100 } = {},
) {
  if (
    !Number.isFinite(minimumScale) ||
    !Number.isFinite(maximumScale) ||
    minimumScale <= 0 ||
    maximumScale <= minimumScale ||
    !Number.isFinite(minimumPosition) ||
    !Number.isFinite(maximumPosition) ||
    maximumPosition <= minimumPosition
  ) {
    return minimumPosition;
  }

  const normalizedScale = normalizeScale(scale, minimumScale, maximumScale, minimumScale);
  const ratio = Math.log(normalizedScale / minimumScale) / Math.log(maximumScale / minimumScale);
  return minimumPosition + ratio * (maximumPosition - minimumPosition);
}

export function sliderPositionToScale(
  position,
  { minimumScale = 0.1, maximumScale = 60, minimumPosition = 0, maximumPosition = 100 } = {},
) {
  if (
    !Number.isFinite(minimumScale) ||
    !Number.isFinite(maximumScale) ||
    minimumScale <= 0 ||
    maximumScale <= minimumScale ||
    !Number.isFinite(minimumPosition) ||
    !Number.isFinite(maximumPosition) ||
    maximumPosition <= minimumPosition
  ) {
    return minimumScale;
  }

  const normalizedPosition = Math.min(maximumPosition, Math.max(minimumPosition, Number(position)));
  const ratio = Number.isFinite(normalizedPosition)
    ? (normalizedPosition - minimumPosition) / (maximumPosition - minimumPosition)
    : 0;
  return minimumScale * Math.pow(maximumScale / minimumScale, ratio);
}

export function calculateWheelScale(
  currentScale,
  deltaY,
  { minimumScale = 0.1, maximumScale = 60, gridLimit = 10, scaleFactor = Math.pow(2, 1 / 6) } = {},
) {
  const normalizedScale = normalizeScale(currentScale, minimumScale, maximumScale, 1);
  if (!Number.isFinite(deltaY) || deltaY === 0 || !Number.isFinite(scaleFactor) || scaleFactor <= 1) {
    return normalizedScale;
  }

  let nextScale = normalizedScale * (deltaY < 0 ? scaleFactor : 1 / scaleFactor);
  const crossesGridLimit =
    Number.isFinite(gridLimit) &&
    ((normalizedScale < gridLimit && nextScale > gridLimit) || (normalizedScale > gridLimit && nextScale < gridLimit));
  if (crossesGridLimit) nextScale = gridLimit;

  return normalizeScale(Number(nextScale.toPrecision(8)), minimumScale, maximumScale, normalizedScale);
}

export function calculateSnappedPanOffset(
  rawOffset,
  renderedOffset,
  delta,
  { leadingBoundary = 0, trailingBoundary = 0, snapDistance = 10 } = {},
) {
  const safeRenderedOffset = Number.isFinite(renderedOffset) ? renderedOffset : 0;
  const safeRawOffset = Number.isFinite(rawOffset) ? rawOffset : safeRenderedOffset;
  const safeDelta = Number.isFinite(delta) ? delta : 0;
  const nextRawOffset = safeRawOffset + safeDelta;
  let nextRenderedOffset = nextRawOffset;

  if (
    Number.isFinite(leadingBoundary) &&
    Number.isFinite(trailingBoundary) &&
    Number.isFinite(snapDistance) &&
    snapDistance > 0
  ) {
    const isNearLeadingBoundary = Math.abs(nextRawOffset - leadingBoundary) < snapDistance;
    const isNearTrailingBoundary = Math.abs(nextRawOffset - trailingBoundary) < snapDistance;
    const isSnappedToLeadingBoundary = safeRenderedOffset === leadingBoundary;
    const isSnappedToTrailingBoundary = safeRenderedOffset === trailingBoundary;

    if (isSnappedToLeadingBoundary && isNearLeadingBoundary) {
      nextRenderedOffset = leadingBoundary;
    } else if (isSnappedToTrailingBoundary && isNearTrailingBoundary) {
      nextRenderedOffset = trailingBoundary;
    } else if (safeDelta < 0 && isNearLeadingBoundary) {
      nextRenderedOffset = leadingBoundary;
    } else if (safeDelta > 0 && isNearTrailingBoundary) {
      nextRenderedOffset = trailingBoundary;
    }
  }

  return {
    rawOffset: nextRawOffset,
    renderedOffset: nextRenderedOffset,
  };
}

export function hasExceededPointerDragThreshold(startPoint, currentPoint, threshold = 4) {
  if (
    !startPoint ||
    !currentPoint ||
    !Number.isFinite(startPoint.x) ||
    !Number.isFinite(startPoint.y) ||
    !Number.isFinite(currentPoint.x) ||
    !Number.isFinite(currentPoint.y)
  ) {
    return false;
  }

  const normalizedThreshold = Number.isFinite(threshold) && threshold >= 0 ? threshold : 4;
  const deltaX = currentPoint.x - startPoint.x;
  const deltaY = currentPoint.y - startPoint.y;
  return deltaX * deltaX + deltaY * deltaY > normalizedThreshold * normalizedThreshold;
}

export function getRenderedPixelPitch(scale, gridLimit = 10) {
  if (!Number.isFinite(scale) || scale <= 0) return 0;
  const gridWidth = Number.isFinite(gridLimit) && scale >= gridLimit ? 1 : 0;
  return scale + gridWidth;
}

export function getRenderedImageSize(imageSize, scale, gridLimit = 10) {
  if (!Number.isSafeInteger(imageSize) || imageSize <= 0) return 0;
  return imageSize * getRenderedPixelPitch(scale, gridLimit);
}

export function calculateVisibleImageAxis(imageSize, viewportSize, offset, scale, gridLimit = 10) {
  const pixelPitch = getRenderedPixelPitch(scale, gridLimit);
  if (
    !Number.isSafeInteger(imageSize) ||
    imageSize <= 0 ||
    !Number.isFinite(viewportSize) ||
    viewportSize <= 0 ||
    !Number.isFinite(offset) ||
    pixelPitch <= 0
  ) {
    return null;
  }

  const renderedSize = imageSize * pixelPitch;
  if (offset >= viewportSize || offset + renderedSize <= 0) return null;

  const visibleStart = Math.max(0, -offset);
  const visibleEnd = Math.min(renderedSize, viewportSize - offset);
  const sourceStart = Math.min(imageSize - 1, Math.floor(visibleStart / pixelPitch));
  const sourceEndExclusive = Math.min(imageSize, Math.max(sourceStart + 1, Math.ceil(visibleEnd / pixelPitch)));

  return {
    pixelPitch,
    renderedSize,
    sourceStart,
    sourceEnd: sourceEndExclusive - 1,
    sourceSize: sourceEndExclusive - sourceStart,
    canvasStart: offset + sourceStart * pixelPitch,
    canvasEnd: offset + sourceEndExclusive * pixelPitch,
  };
}

export function calculatePointerAnchoredOffset(pointerPosition, currentOffset, oldScale, newScale, gridLimit = 10) {
  const oldPixelPitch = getRenderedPixelPitch(oldScale, gridLimit);
  const newPixelPitch = getRenderedPixelPitch(newScale, gridLimit);
  if (
    !Number.isFinite(pointerPosition) ||
    !Number.isFinite(currentOffset) ||
    oldPixelPitch <= 0 ||
    newPixelPitch <= 0
  ) {
    return currentOffset;
  }

  const imagePosition = (pointerPosition - currentOffset) / oldPixelPitch;
  return pointerPosition - imagePosition * newPixelPitch;
}

export function clientToLocalPoint(clientPoint, bounds, border = { left: 0, top: 0 }) {
  if (
    !clientPoint ||
    !Number.isFinite(clientPoint.x) ||
    !Number.isFinite(clientPoint.y) ||
    !bounds ||
    !Number.isFinite(bounds.left) ||
    !Number.isFinite(bounds.top)
  ) {
    return null;
  }

  return {
    x: clientPoint.x - bounds.left - (Number.isFinite(border?.left) ? border.left : 0),
    y: clientPoint.y - bounds.top - (Number.isFinite(border?.top) ? border.top : 0),
  };
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
  return viewportSize / 2 - center * getRenderedPixelPitch(scale, gridLimit);
}

export function calculateFitScale(
  imageSize,
  viewportSize,
  { minimumScale = 0.1, maximumScale = 60, gridLimit = 10 } = {},
) {
  if (
    !imageSize ||
    !Number.isFinite(imageSize.width) ||
    imageSize.width <= 0 ||
    !Number.isFinite(imageSize.height) ||
    imageSize.height <= 0 ||
    !viewportSize ||
    !Number.isFinite(viewportSize.width) ||
    viewportSize.width <= 0 ||
    !Number.isFinite(viewportSize.height) ||
    viewportSize.height <= 0
  ) {
    return null;
  }

  const visualPixelSize = Math.min(viewportSize.width / imageSize.width, viewportSize.height / imageSize.height);
  return getFocusScale(visualPixelSize, gridLimit, minimumScale, maximumScale);
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
  { scale, gridLimit, offsetX, offsetY, canvasOffsetLeft, canvasOffsetTop },
) {
  const pixelPitch = getRenderedPixelPitch(scale, gridLimit);

  return {
    x: imagePoint.x * pixelPitch + offsetX + canvasOffsetLeft,
    y: imagePoint.y * pixelPitch + offsetY + canvasOffsetTop,
  };
}

export function scaledToCanvasPoint(scaledPoint, transform) {
  const pixelPitch = getRenderedPixelPitch(transform.scale, transform.gridLimit);

  return {
    x: (scaledPoint.x / transform.scale) * pixelPitch + transform.offsetX + transform.canvasOffsetLeft,
    y: (scaledPoint.y / transform.scale) * pixelPitch + transform.offsetY + transform.canvasOffsetTop,
  };
}

export function canvasToImagePoint(
  canvasPoint,
  { scale, gridLimit, offsetX, offsetY, canvasOffsetLeft, canvasOffsetTop },
) {
  const pixelPitch = getRenderedPixelPitch(scale, gridLimit);

  return {
    x: Math.floor((canvasPoint.x - offsetX - canvasOffsetLeft) / pixelPitch),
    y: Math.floor((canvasPoint.y - offsetY - canvasOffsetTop) / pixelPitch),
  };
}

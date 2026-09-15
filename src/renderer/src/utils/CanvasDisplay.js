export function normalizeDevicePixelRatio(pixelRatio) {
  return Number.isFinite(pixelRatio) && pixelRatio > 0 ? pixelRatio : 1;
}

export function getCanvasBackingLength(cssLength, pixelRatio) {
  if (!Number.isFinite(cssLength) || cssLength <= 0) return 0;
  return Math.floor(cssLength * normalizeDevicePixelRatio(pixelRatio));
}

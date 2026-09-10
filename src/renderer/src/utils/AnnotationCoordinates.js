export function normalizeCoordinateScale(coordinateScale) {
  const x = typeof coordinateScale === 'number' ? coordinateScale : coordinateScale?.x;
  const y = typeof coordinateScale === 'number' ? coordinateScale : coordinateScale?.y;
  if (!Number.isFinite(x) || x < 0 || !Number.isFinite(y) || y < 0) return null;
  return { x, y };
}

function isFinitePoint(point) {
  return point !== null && Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

export function datasetPointToImagePoint(point, coordinateScale) {
  const normalizedScale = normalizeCoordinateScale(coordinateScale);
  if (!isFinitePoint(point) || normalizedScale === null) return null;

  return {
    x: normalizedScale.x === 0 ? 0 : Math.round(point.x * normalizedScale.x),
    y: normalizedScale.y === 0 ? 0 : Math.round(point.y * normalizedScale.y),
  };
}

export function imagePointToDatasetPoint(point, coordinateScale) {
  const normalizedScale = normalizeCoordinateScale(coordinateScale);
  if (!isFinitePoint(point) || normalizedScale === null) return null;

  const mappedPoint = {
    x: normalizedScale.x === 0 ? 0 : Math.round(point.x / normalizedScale.x),
    y: normalizedScale.y === 0 ? 0 : Math.round(point.y / normalizedScale.y),
  };
  return Number.isSafeInteger(mappedPoint.x) && Number.isSafeInteger(mappedPoint.y) ? mappedPoint : null;
}

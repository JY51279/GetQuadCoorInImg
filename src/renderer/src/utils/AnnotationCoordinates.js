export function normalizeCoordinateScale(coordinateScale) {
  const x = typeof coordinateScale === 'number' ? coordinateScale : coordinateScale?.x;
  const y = typeof coordinateScale === 'number' ? coordinateScale : coordinateScale?.y;
  if (!Number.isFinite(x) || x <= 0 || !Number.isFinite(y) || y <= 0) return null;
  return { x, y };
}

function isFinitePoint(point) {
  return point !== null && Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

export function datasetPointToImagePoint(point, coordinateScale) {
  const normalizedScale = normalizeCoordinateScale(coordinateScale);
  if (!isFinitePoint(point) || normalizedScale === null) return null;

  return {
    x: Math.round(point.x * normalizedScale.x),
    y: Math.round(point.y * normalizedScale.y),
  };
}

export function imagePointToDatasetPoint(point, coordinateScale) {
  const normalizedScale = normalizeCoordinateScale(coordinateScale);
  if (!isFinitePoint(point) || normalizedScale === null) return null;

  const mappedPoint = {
    x: Math.round(point.x / normalizedScale.x),
    y: Math.round(point.y / normalizedScale.y),
  };
  return Number.isSafeInteger(mappedPoint.x) && Number.isSafeInteger(mappedPoint.y) ? mappedPoint : null;
}

// Vectors use ties away from zero so translating by +d and -d is reversible.
// Absolute points deliberately retain their existing Math.round semantics.
export function imageDeltaToDatasetDelta(delta, coordinateScale) {
  const normalizedScale = normalizeCoordinateScale(coordinateScale);
  if (!isFinitePoint(delta) || normalizedScale === null) return null;
  const roundDelta = value => Math.sign(value) * Math.round(Math.abs(value)) || 0;
  const mappedDelta = {
    x: roundDelta(delta.x / normalizedScale.x),
    y: roundDelta(delta.y / normalizedScale.y),
  };
  return Number.isSafeInteger(mappedDelta.x) && Number.isSafeInteger(mappedDelta.y) ? mappedDelta : null;
}

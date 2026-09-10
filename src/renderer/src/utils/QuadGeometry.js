import { setQuadDots2ClockWise } from './BasicFuncs.js';

function isSafeIntegerPoint(point) {
  return point !== null && Number.isSafeInteger(point?.x) && Number.isSafeInteger(point?.y);
}

function crossProduct(point1, point2, point3) {
  return (point2.x - point1.x) * (point3.y - point2.y) - (point2.y - point1.y) * (point3.x - point2.x);
}

function validateCanonicalQuad(points) {
  const uniquePoints = new Set(points.map(point => `${point.x},${point.y}`));
  if (uniquePoints.size !== 4) {
    return { success: false, error: 'A Quad must contain four distinct points.' };
  }

  let turnDirection = 0;
  for (let index = 0; index < points.length; index++) {
    const cross = crossProduct(points[index], points[(index + 1) % 4], points[(index + 2) % 4]);
    if (cross === 0) {
      return { success: false, error: 'A Quad cannot contain three collinear points.' };
    }

    const currentDirection = Math.sign(cross);
    if (turnDirection !== 0 && currentDirection !== turnDirection) {
      return { success: false, error: 'A Quad must remain convex and cannot contain crossing edges.' };
    }
    turnDirection = currentDirection;
  }

  return { success: true };
}

export function prepareQuadPointUpdate(points, pointIndex, nextPoint, barcodeType = '') {
  if (!Array.isArray(points) || points.length !== 4 || !points.every(isSafeIntegerPoint)) {
    return { success: false, error: 'The current Quad does not contain four valid integer points.' };
  }
  if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= points.length) {
    return { success: false, error: 'The Quad point index is invalid.' };
  }
  if (!isSafeIntegerPoint(nextPoint)) {
    return { success: false, error: 'The Quad point coordinates are invalid.' };
  }

  const normalizedPoints = points.map(point => ({ ...point }));
  normalizedPoints[pointIndex] = { ...nextPoint };
  if (!setQuadDots2ClockWise(normalizedPoints, barcodeType)) {
    return { success: false, error: 'Failed to normalize the Quad point order.' };
  }

  const validationResult = validateCanonicalQuad(normalizedPoints);
  if (!validationResult.success) return validationResult;
  return { success: true, points: normalizedPoints };
}

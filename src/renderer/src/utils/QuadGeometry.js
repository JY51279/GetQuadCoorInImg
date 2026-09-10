function swap(points, firstIndex, secondIndex) {
  [points[firstIndex], points[secondIndex]] = [points[secondIndex], points[firstIndex]];
}

function isFinitePoint(point) {
  return point !== null && Number.isFinite(point?.x) && Number.isFinite(point?.y);
}

function isSafeIntegerPoint(point) {
  return point !== null && Number.isSafeInteger(point?.x) && Number.isSafeInteger(point?.y);
}

function getTurnCrossProduct(point1, point2, point3) {
  return (point2.x - point1.x) * (point3.y - point2.y) - (point2.y - point1.y) * (point3.x - point2.x);
}

function getTopLeftPointIndex(points) {
  let minimumCoordinateSum = Infinity;
  let targetIndex = -1;
  for (let index = 0; index < points.length; index++) {
    const coordinateSum = points[index].x + points[index].y;
    if (coordinateSum < minimumCoordinateSum) {
      minimumCoordinateSum = coordinateSum;
      targetIndex = index;
    }
  }
  return targetIndex;
}

export function sortQuadPointsClockwise(points, barcodeType = '') {
  if (!Array.isArray(points) || points.length !== 4 || !points.every(isFinitePoint)) return false;

  const topLeftIndex = barcodeType === 'datamatrix' ? 0 : getTopLeftPointIndex(points);
  if (topLeftIndex === -1) return false;
  if (topLeftIndex !== 0) swap(points, 0, topLeftIndex);

  const relativeX = new Array(3);
  const relativeY = new Array(3);
  for (let index = 1; index < 4; index++) {
    relativeX[index - 1] = points[index].x - points[0].x;
    relativeY[index - 1] = points[index].y - points[0].y;
  }

  if (relativeX[0] * relativeY[1] < relativeX[1] * relativeY[0]) {
    swap(points, 1, 2);
    swap(relativeX, 0, 1);
    swap(relativeY, 0, 1);
  }
  if (relativeX[1] * relativeY[2] < relativeX[2] * relativeY[1]) {
    if (relativeX[0] * relativeY[2] < relativeX[2] * relativeY[0]) swap(points, 1, 3);
    swap(points, 2, 3);
  }
  return true;
}

export function getQuadCenterPoint(points) {
  if (!Array.isArray(points) || points.length !== 4 || !points.every(isFinitePoint)) return null;
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / 4,
    y: points.reduce((sum, point) => sum + point.y, 0) / 4,
  };
}

function isPointRightOfLine(point, lineStart, lineEnd) {
  return (lineEnd.x - lineStart.x) * (point.y - lineStart.y) - (lineEnd.y - lineStart.y) * (point.x - lineStart.x) > 0;
}

export function isPointInQuad(point, quadPoints) {
  if (!isFinitePoint(point) || !Array.isArray(quadPoints) || quadPoints.length !== 4) return false;

  const orderedPoints = quadPoints.map(quadPoint => ({ ...quadPoint }));
  if (!sortQuadPointsClockwise(orderedPoints)) return false;
  for (let endIndex = 0, startIndex = 3; endIndex < 4; startIndex = endIndex++) {
    if (!isPointRightOfLine(point, orderedPoints[startIndex], orderedPoints[endIndex])) return false;
  }
  return true;
}

function validateCanonicalQuad(points) {
  const uniquePoints = new Set(points.map(point => `${point.x},${point.y}`));
  if (uniquePoints.size !== 4) {
    return { success: false, error: 'A Quad must contain four distinct points.' };
  }

  let turnDirection = 0;
  for (let index = 0; index < points.length; index++) {
    const cross = getTurnCrossProduct(points[index], points[(index + 1) % 4], points[(index + 2) % 4]);
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
  if (!sortQuadPointsClockwise(normalizedPoints, barcodeType)) {
    return { success: false, error: 'Failed to normalize the Quad point order.' };
  }

  const validationResult = validateCanonicalQuad(normalizedPoints);
  if (!validationResult.success) return validationResult;
  return { success: true, points: normalizedPoints };
}

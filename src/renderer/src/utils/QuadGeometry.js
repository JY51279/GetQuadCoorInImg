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

  const preserveFirstPoint = typeof barcodeType === 'string' && barcodeType.toLowerCase() === 'datamatrix';
  const topLeftIndex = preserveFirstPoint ? 0 : getTopLeftPointIndex(points);
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

export function calculateClampedQuadTranslation(points, requestedDelta, imageSize) {
  if (
    !Array.isArray(points) ||
    points.length !== 4 ||
    !points.every(isSafeIntegerPoint) ||
    !isSafeIntegerPoint(requestedDelta) ||
    !Number.isSafeInteger(imageSize?.width) ||
    imageSize.width <= 0 ||
    !Number.isSafeInteger(imageSize?.height) ||
    imageSize.height <= 0
  ) {
    return null;
  }

  const xValues = points.map(point => point.x);
  const yValues = points.map(point => point.y);
  const minimumX = Math.min(...xValues);
  const maximumX = Math.max(...xValues);
  const minimumY = Math.min(...yValues);
  const maximumY = Math.max(...yValues);
  if (minimumX < 0 || maximumX >= imageSize.width || minimumY < 0 || maximumY >= imageSize.height) return null;

  const delta = {
    x: Math.min(imageSize.width - 1 - maximumX, Math.max(-minimumX, requestedDelta.x)),
    y: Math.min(imageSize.height - 1 - maximumY, Math.max(-minimumY, requestedDelta.y)),
  };
  return {
    points: points.map(point => ({ x: point.x + delta.x, y: point.y + delta.y })),
    delta,
    clamped: delta.x !== requestedDelta.x || delta.y !== requestedDelta.y,
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
    return { success: false, error: 'Quad 必须包含四个不同的点。' };
  }

  let turnDirection = 0;
  for (let index = 0; index < points.length; index++) {
    const cross = getTurnCrossProduct(points[index], points[(index + 1) % 4], points[(index + 2) % 4]);
    if (cross === 0) {
      return { success: false, error: 'Quad 不能包含三个共线点。' };
    }

    const currentDirection = Math.sign(cross);
    if (turnDirection !== 0 && currentDirection !== turnDirection) {
      return { success: false, error: 'Quad 必须保持凸四边形，且边不能交叉。' };
    }
    turnDirection = currentDirection;
  }

  return { success: true };
}

export function prepareQuad(points, barcodeType = '') {
  if (!Array.isArray(points) || points.length < 2 || points.length > 4) {
    return { success: false, error: '创建 Quad 需要输入两个、三个或四个点。' };
  }
  if (!points.every(isSafeIntegerPoint)) {
    return { success: false, error: 'Quad 必须包含有效的整数坐标点。' };
  }

  const normalizedPoints = points.map(point => ({ ...point }));
  if (normalizedPoints.length === 2) {
    const [firstPoint, secondPoint] = normalizedPoints;
    normalizedPoints.push({ x: firstPoint.x, y: secondPoint.y }, { x: secondPoint.x, y: firstPoint.y });
  } else if (normalizedPoints.length === 3) {
    const [firstPoint, secondPoint, thirdPoint] = normalizedPoints;
    normalizedPoints.push({
      x: firstPoint.x + (thirdPoint.x - secondPoint.x),
      y: firstPoint.y + (thirdPoint.y - secondPoint.y),
    });
  }

  if (!normalizedPoints.every(isSafeIntegerPoint)) {
    return { success: false, error: '补全后的 Quad 坐标超出安全整数范围。' };
  }
  if (!sortQuadPointsClockwise(normalizedPoints, barcodeType)) {
    return { success: false, error: '无法规范化 Quad 顶点顺序。' };
  }

  const validationResult = validateCanonicalQuad(normalizedPoints);
  if (!validationResult.success) return validationResult;
  return { success: true, points: normalizedPoints };
}

export function prepareQuadPointUpdate(points, pointIndex, nextPoint, barcodeType = '') {
  if (!Array.isArray(points) || points.length !== 4 || !points.every(isSafeIntegerPoint)) {
    return { success: false, error: '当前 Quad 不包含四个有效的整数坐标点。' };
  }
  if (!Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= points.length) {
    return { success: false, error: 'Quad 顶点序号无效。' };
  }
  if (!isSafeIntegerPoint(nextPoint)) {
    return { success: false, error: 'Quad 顶点坐标无效。' };
  }

  const normalizedPoints = points.map(point => ({ ...point }));
  normalizedPoints[pointIndex] = { ...nextPoint };
  return prepareQuad(normalizedPoints, barcodeType);
}

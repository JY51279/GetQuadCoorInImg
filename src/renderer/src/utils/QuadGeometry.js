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

export const QUAD_TRANSLATION_TARGET = Object.freeze({
  WHOLE: 'whole',
  EDGE: 'edge',
});

const WHOLE_QUAD_TRANSLATION_TARGET = Object.freeze({ type: QUAD_TRANSLATION_TARGET.WHOLE });

const TRANSLATION_TARGET_NORMALIZERS = Object.freeze({
  [QUAD_TRANSLATION_TARGET.WHOLE]: () => ({ ...WHOLE_QUAD_TRANSLATION_TARGET }),
  [QUAD_TRANSLATION_TARGET.EDGE]: target => {
    if (!Number.isInteger(target.edgeIndex) || target.edgeIndex < 0 || target.edgeIndex >= 4) return null;
    return { type: QUAD_TRANSLATION_TARGET.EDGE, edgeIndex: target.edgeIndex };
  },
});
const TRANSLATED_POINT_INDEX_FACTORIES = Object.freeze({
  [QUAD_TRANSLATION_TARGET.WHOLE]: () => [0, 1, 2, 3],
  [QUAD_TRANSLATION_TARGET.EDGE]: target => [target.edgeIndex, (target.edgeIndex + 1) % 4],
});

export function normalizeQuadTranslationTarget(target = WHOLE_QUAD_TRANSLATION_TARGET) {
  return TRANSLATION_TARGET_NORMALIZERS[target?.type]?.(target) ?? null;
}

function getTranslatedPointIndices(target) {
  return TRANSLATED_POINT_INDEX_FACTORIES[target.type](target);
}

function translateQuadPoints(points, pointIndices, delta) {
  const translatedIndices = new Set(pointIndices);
  return points.map((point, pointIndex) =>
    translatedIndices.has(pointIndex) ? { x: point.x + delta.x, y: point.y + delta.y } : { ...point },
  );
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

export function calculateClampedQuadTranslation(points, requestedDelta, imageSize, target) {
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

  const normalizedTarget = normalizeQuadTranslationTarget(target);
  if (normalizedTarget === null) return null;

  const xValues = points.map(point => point.x);
  const yValues = points.map(point => point.y);
  const minimumX = Math.min(...xValues);
  const maximumX = Math.max(...xValues);
  const minimumY = Math.min(...yValues);
  const maximumY = Math.max(...yValues);
  if (minimumX < 0 || maximumX >= imageSize.width || minimumY < 0 || maximumY >= imageSize.height) return null;

  const translatedPointIndices = getTranslatedPointIndices(normalizedTarget);
  const translatedPoints = translatedPointIndices.map(pointIndex => points[pointIndex]);
  const translatedXValues = translatedPoints.map(point => point.x);
  const translatedYValues = translatedPoints.map(point => point.y);
  const translatedMinimumX = Math.min(...translatedXValues);
  const translatedMaximumX = Math.max(...translatedXValues);
  const translatedMinimumY = Math.min(...translatedYValues);
  const translatedMaximumY = Math.max(...translatedYValues);

  const boundaryClampedDelta = {
    x: Math.min(imageSize.width - 1 - translatedMaximumX, Math.max(-translatedMinimumX, requestedDelta.x)),
    y: Math.min(imageSize.height - 1 - translatedMaximumY, Math.max(-translatedMinimumY, requestedDelta.y)),
  };

  let delta = boundaryClampedDelta;
  let translatedQuad = translateQuadPoints(points, translatedPointIndices, delta);
  if (normalizedTarget.type === QUAD_TRANSLATION_TARGET.EDGE) {
    if (!validateCanonicalQuad(points).success) return null;
    const turnDirection = Math.sign(getTurnCrossProduct(points[0], points[1], points[2]));
    if (!hasCanonicalQuadDirection(translatedQuad, turnDirection)) {
      let minimumRatio = 0;
      let maximumRatio = 1;
      let validDelta = { x: 0, y: 0 };
      let validPoints = points.map(point => ({ ...point }));

      for (let iteration = 0; iteration < 32; iteration++) {
        const ratio = (minimumRatio + maximumRatio) / 2;
        const candidateDelta = {
          x: Math.round(boundaryClampedDelta.x * ratio),
          y: Math.round(boundaryClampedDelta.y * ratio),
        };
        const candidatePoints = translateQuadPoints(points, translatedPointIndices, candidateDelta);
        if (hasCanonicalQuadDirection(candidatePoints, turnDirection)) {
          minimumRatio = ratio;
          validDelta = candidateDelta;
          validPoints = candidatePoints;
        } else {
          maximumRatio = ratio;
        }
      }

      delta = validDelta;
      translatedQuad = validPoints;
    }
  }

  return {
    points: translatedQuad,
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

function hasCanonicalQuadDirection(points, turnDirection) {
  return (
    validateCanonicalQuad(points).success &&
    Math.sign(getTurnCrossProduct(points[0], points[1], points[2])) === turnDirection
  );
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

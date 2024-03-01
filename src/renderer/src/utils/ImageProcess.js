import { getQuadCenterPoint, getNearestOrFarthestPointIndex } from './BasicFuncs.js';
export function getOuterInnerQuads(quadPointsLTInCanvas, pixelScale) {
  const endOfQuadPoints = [];
  for (let i = 0; i < 4; ++i) {
    const endPoints = [];
    endPoints.push(quadPointsLTInCanvas[i]);
    endPoints.push({ x: quadPointsLTInCanvas[i].x + pixelScale, y: quadPointsLTInCanvas[i].y });
    endPoints.push({ x: quadPointsLTInCanvas[i].x + pixelScale, y: quadPointsLTInCanvas[i].y + pixelScale });
    endPoints.push({ x: quadPointsLTInCanvas[i].x, y: quadPointsLTInCanvas[i].y + pixelScale });
    endOfQuadPoints.push(endPoints);
  }

  const centerPt = getQuadCenterPoint(quadPointsLTInCanvas);
  const outerQuadPoints = getOuterQuad(endOfQuadPoints, centerPt);
  const innerQuadPoints = getInnerQuad(endOfQuadPoints, centerPt);
  return { outerQuadPoints, innerQuadPoints };
}

function getOuterQuad(endOfQuadPoints, centerPt) {
  const outerQuadPoints = [];
  for (let i = 0; i < 4; ++i) {
    const pointIndex = getNearestOrFarthestPointIndex(endOfQuadPoints[i], centerPt, false);
    outerQuadPoints.push(endOfQuadPoints[i][pointIndex]);
  }
  return outerQuadPoints;
}

function getInnerQuad(endOfQuadPoints, centerPt) {
  const outerQuadPoints = [];
  for (let i = 0; i < 4; ++i) {
    const pointIndex = getNearestOrFarthestPointIndex(endOfQuadPoints[i], centerPt, true);
    outerQuadPoints.push(endOfQuadPoints[i][pointIndex]);
  }
  return outerQuadPoints;
}

export function drawPath(ctx, quadPoints) {
  ctx.beginPath();
  ctx.moveTo(quadPoints[0].x, quadPoints[0].y);
  ctx.lineTo(quadPoints[1].x, quadPoints[1].y);
  ctx.lineTo(quadPoints[2].x, quadPoints[2].y);
  ctx.lineTo(quadPoints[3].x, quadPoints[3].y);
  ctx.closePath();
}

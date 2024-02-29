import { getQuadCenterPoint, getNearestOrFarthestPoint } from './BasicFuncs.js';
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
    outerQuadPoints.push(getNearestOrFarthestPoint(endOfQuadPoints[i], centerPt, false));
  }
  return outerQuadPoints;
}

function getInnerQuad(endOfQuadPoints, centerPt) {
  const outerQuadPoints = [];
  for (let i = 0; i < 4; ++i) {
    outerQuadPoints.push(getNearestOrFarthestPoint(endOfQuadPoints[i], centerPt));
  }
  return outerQuadPoints;
}

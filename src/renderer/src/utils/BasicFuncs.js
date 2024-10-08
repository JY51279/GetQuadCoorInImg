import cloneDeep from 'lodash/cloneDeep';
export const KEYS = {
  NEXT: 'next',
  PREVIOUS: 'previous',
  JSON_MODIFY: 'Modify JSON content',
  JSON_DELETE: 'Delete JSON content',
  JSON_ADD: 'Add JSON content', // 仅在DDN使用
  OPERATE_SUCCESS: 'Operate Success',
  OPERATE_FAIL: 'Operate Fail',
  // 其他键...
};
export const PRODUCTS = {
  DBR: 'DBR',
  DDN: 'DDN',
  DLR: 'DLR',
};
export function swap(arr, index1, index2) {
  [arr[index1], arr[index2]] = [arr[index2], arr[index1]];
}

//***********************Point*************************/
// 计算两点之间的欧氏距离
function distance(point1, point2) {
  const dx = point1.x - point2.x;
  const dy = point1.y - point2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function getNearestOrFarthestPointIndex(points, target, findNearest = true) {
  // 初始化最小/最大距离和对应的点的下标
  let minDistance = Infinity;
  let maxDistance = -Infinity;
  let nearestIndex = -1;
  let farthestIndex = -1;

  // 遍历点的数组
  for (let i = 0; i < points.length; i++) {
    // 计算当前点到目标点的距离
    const dist = distance(points[i], target);

    // 更新最近点的信息
    if (dist < minDistance) {
      minDistance = dist;
      nearestIndex = i;
    }

    // 更新最远点的信息
    if (dist > maxDistance) {
      maxDistance = dist;
      farthestIndex = i;
    }
  }

  // 返回最近或最远点的下标
  return findNearest ? nearestIndex : farthestIndex;
}

// 以左上点为0号点顺时针排序
export function setQuadDots2ClockWise(dotsArray, barcodeType = '') {
  const leftUpId = barcodeType === 'datamatrix' ? 0 : calcLeftUpPtIndex(dotsArray);
  if (leftUpId === -1) return false;
  if (leftUpId !== 0) swap(dotsArray, 0, leftUpId);

  let xArr = new Array(3),
    yArr = new Array(3);
  for (let i = 1; i < 4; ++i) {
    xArr[i - 1] = dotsArray[i].x - dotsArray[0].x;
    yArr[i - 1] = dotsArray[i].y - dotsArray[0].y;
  }
  if (xArr[0] * yArr[1] < xArr[1] * yArr[0]) {
    // 1/2是逆时针
    swap(dotsArray, 1, 2);
    swap(xArr, 0, 1);
    swap(yArr, 0, 1);
  }
  if (xArr[1] * yArr[2] < xArr[2] * yArr[1]) {
    // 1/2是顺时针且2/3是逆时针
    if (xArr[0] * yArr[2] < xArr[2] * yArr[0]) {
      // 1/3是逆时针
      swap(dotsArray, 1, 3);
    }
    swap(dotsArray, 2, 3);
  }
  return true;
}

function calcLeftUpPtIndex(dotsArray) {
  let xySumTmp = 0,
    xySumMin = Infinity,
    targetId = -1;
  for (let i = 0; i < dotsArray.length; ++i) {
    xySumTmp = dotsArray[i].x + dotsArray[i].y;
    if (xySumTmp < xySumMin) (xySumMin = xySumTmp), (targetId = i);
  }
  return targetId;
}

export function getQuadCenterPoint(dotsArray) {
  let targetPt = { x: 0, y: 0 };
  let centerPt1 = { x: 0, y: 0 };
  let centerPt2 = { x: 0, y: 0 };
  getCenterPt(centerPt1, dotsArray[0], dotsArray[1]);
  getCenterPt(centerPt2, dotsArray[2], dotsArray[3]);
  getCenterPt(targetPt, centerPt1, centerPt2);
  return targetPt;
}

function getCenterPt(targetPt, point1, point2) {
  targetPt.x = (point1.x + point2.x) / 2;
  targetPt.y = (point1.y + point2.y) / 2;
}

export function parsePointString2Array(str, separator) {
  if (!separator) {
    console.log('parsePointString2Array: separator is null');
    return null;
  }
  const points = [];
  const coords = str.split(separator).map(Number);
  for (let i = 0; i < coords.length; i += 2) {
    points.push({ x: coords[i], y: coords[i + 1] });
  }
  return points;
}

export function isPointInPolygon(point, polygon) {
  setQuadDots2ClockWise(polygon);
  let inside = true;
  for (let end = 0, start = polygon.length - 1; end < polygon.length; start = end++) {
    const line = [polygon[start], polygon[end]];
    if (!isPointRightOfLine(point, line)) {
      inside = false;
      break;
    }
  }
  return inside;
}

export function isPointRightOfLine(point, line) {
  let x = point.x,
    y = point.y;
  let xi = line[0].x,
    yi = line[0].y;
  let xj = line[1].x,
    yj = line[1].y;
  return (xj - xi) * (y - yi) - (yj - yi) * (x - xi) > 0;
}
//***********************Json*************************/
export function transStr2Json(jsonStr) {
  var json = JSON.parse(jsonStr);
  return json;
}
export function transJson2Str(json) {
  var jsonStr = JSON.stringify(json, null, 2);
  return jsonStr;
}

export function serializePointArray2String(points, separator, barcodeType) {
  let pointsTmp = cloneDeep(points);
  if (!setQuadDots2ClockWise(pointsTmp, barcodeType)) return '';
  const str = pointsTmp.map(item => `${item.x} ${item.y}`).join(separator);
  return str;
}

// unusedFunction
export function getClosestPtIndexInArray(oriPoint, pointArray) {
  let minDistance = Infinity;
  let closestIndex = -1;

  for (let i = 0; i < pointArray.length; i++) {
    const point = pointArray[i];
    const distance = Math.sqrt(Math.pow(oriPoint.x - point.x, 2) + Math.pow(oriPoint.y - point.y, 2));
    if (distance < minDistance) {
      minDistance = distance;
      closestIndex = i;
    }
  }

  return closestIndex;
}

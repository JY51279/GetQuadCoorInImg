export const KEYS = {
  NEXT: 'next',
  PREVIOUS: 'previous',
  JSON_MODIFY: 'Modify JSON content',
  JSON_DELETE: 'Delete JSON content',
  JSON_ADD: 'Add JSON content',
  OPERATE_SUCCESS: 'Operate Success',
  OPERATE_FAIL: 'Operate Fail',
  // 其他键...
};

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

//***********************Json*************************/
export function transStr2Json(jsonStr) {
  const jsonText = typeof jsonStr === 'string' && jsonStr.charCodeAt(0) === 0xfeff ? jsonStr.slice(1) : jsonStr;
  var json = JSON.parse(jsonText);
  return json;
}
export function transJson2Str(json) {
  var jsonStr = JSON.stringify(json, null, 2);
  return jsonStr;
}

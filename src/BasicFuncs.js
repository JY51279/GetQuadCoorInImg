export function swap(arr, index1, index2) {
    [arr[index1], arr[index2]] = [arr[index2], arr[index1]];
}

// 以左上点为0号点顺时针排序
export function setQuadDots2ClockWise(dotsArray)
{
    const leftUpId = calcLeftUpPtIndex();
    if (leftUpId === -1) return false;
    if (leftUpId !== 0)
        swap(dotsArray, 0, leftUpId);

    let xArr = new Array(3), yArr = new Array(3);
    for (let i = 1; i < 4; ++i)
    {
        xArr[i - 1] = dotsArray[i].x - dotsArray[0].x;
        yArr[i - 1] = dotsArray[i].y - dotsArray[0].y;
    }
    if (xArr[0] * yArr[1] < xArr[1] * yArr[0]) // 1/2是逆时针
    {
        swap(dotsArray, 1, 2); 
        swap(xArr, 0, 1);
        swap(yArr, 0, 1);
    }
    if (xArr[1] * yArr[2] < xArr[2] * yArr[1]) // 1/2是顺时针且2/3是逆时针
    {
        if (xArr[0] * yArr[2] < xArr[2] * yArr[0]) // 1/3是逆时针
        {
            swap(dotsArray, 1, 3); 
        }
        swap(dotsArray, 2, 3); 
    }
    return true;
}

function calcLeftUpPtIndex(dotsArray)
{
  let xySumTmp = 0, xySumMin = Number.MAX_VALUE, targetId = -1;
  for (let i = 0; i < dotsArray.length; ++i)
  {
    xySumTmp = dotsArray[i].x + dotsArray[i].y;
    if (xySumTmp < xySumMin)
      xySumMin = xySumTmp, targetId = i;
  }
  return targetId;
}

export function getQuadCenterPoint(dotsArray)
{
    let targetPt = { x: 0, y: 0 };
    let centerPt1 = { x: 0, y: 0 };
    let centerPt2 = { x: 0, y: 0 };
    getCenterPt(centerPt1, dotsArray[0], dotsArray[1]);
    getCenterPt(centerPt2, dotsArray[2], dotsArray[3]);
    getCenterPt(targetPt, centerPt1, centerPt2);
    return targetPt;
}

function getCenterPt(targetPt, point1, point2)
{
    targetPt = { x: 0, y: 0 };
    targetPt.x = (point1.x + point2.x) / 2;
    targetPt.y = (point1.y + point2.y) / 2;
}

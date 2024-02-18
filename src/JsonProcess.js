import { setQuadDots2ClockWise, getQuadCenterPoint, parsePointString, getClosestPtIndexInArray } from './BasicFuncs.js';
export function resetJsonProcess(jsonStr, classStr, imgStr)
{
  quadIndex = -1;
  try {
    resetJson(jsonStr);
    resetClassKeys(classStr.toUpperCase());
    console.log("000");
    resetPicJson(imgStr);
    console.log("111");
    resetCenterPtList();
    console.log("222")
  }
  catch(err) {
    window.alert("Failed to reset JSON data. Please check the input and try again.");
  }
}

const rootKey = "Picture";
const imgKey = "Image Source";
const TotalClassKeys = [
  {
      class: 'DBR',
      key1: 'Barcode Info',
      key2: 'Barcode Location'
    }, 
    {
      class: 'DDN',
      key1: 'Quadrilateral Info',
      key2: 'Expected Quadrilateral Points'
    },
    {
      class: 'DLR',
      key1: 'Label Info',
      key2: 'Label Location'
    }
  ];

let classKeys = {class:'', key1:'', key2:''};
function resetClassKeys(classStr)
{
  for (let i = 0; i < 3; ++i)
  {
      if (TotalClassKeys[i].class === classStr)
      {
        classKeys = TotalClassKeys[i];
        console.log(classKeys);
      }
  }
}


function resetImgIndex(imgStr)
{
  let imgIndex = -1;
  for (let i = 0; i < json[rootKey].length; ++i)
  {
    if (json[rootKey][i][imgKey].search(imgStr) !== -1)
    {
      imgIndex = i;
      return imgIndex;
    }
  }
  return imgIndex;
}

let jsonPerPicArray = [];
function resetPicJson(imgStr)
{
  const imgIndex = resetImgIndex(imgStr);
  if(imgIndex === -1)
  {
    window.alert("Unable to retrieve the image from the JSON file.");
  }
  jsonPerPicArray = json[rootKey][imgIndex][classKeys.key1];
}

let json = {};
function resetJson(jsonStr)
{
  json = JSON.parse(jsonStr);
  //console.log(json);
}

let centerPtList = [];
const separator = ' ';
function resetCenterPtList()
{
  centerPtList = [];
  for (let i = 0; i < jsonPerPicArray.length; ++i)
  {
    const quadPts = parsePointString(jsonPerPicArray[i][classKeys.key2], separator);
    const quadCenter = getQuadCenterPoint(quadPts);
    centerPtList.push(quadCenter);
  }
}


let quadDots = [];
let quadDotsStr = '';
let centerPt = { x: 0, y: 0 };
let quadIndex = -1;
export function setQuadInfo(realDots, quadNumberRef)
{
  if (realDots.length !== 4) {
    window.alert("Not enough dots to obtain the quadInfo.");
    return;
  }
  quadDots = realDots.slice();
  setQuadDots2ClockWise(quadDots);
  //quadDotsStr = array.join(separator); // 将数组转换为以separator分隔的字符串
  centerPt = getQuadCenterPoint(quadDots);
  quadIndex = getClosestPtIndexInArray(centerPt, centerPtList);
  quadNumberRef.value = quadIndex + 1;
  console.log("quadIndex: " + quadIndex);
}




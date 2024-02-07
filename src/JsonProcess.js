import { setQuadDots2ClockWise, getQuadCenterPoint } from './BasicFuncs.js';

export function getDefultQuadIndex(dotsRealCoor) {
  return defaultQuadIndex;
}

export function resetJsonProcess(jsonStr, classStr, imgStr)
{
  defaultQuadIndex = -1;
  try {
    resetJson(jsonStr);
    resetClassKeys(classStr.toUpperCase());
    resetPicJson(imgStr);
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
      imgIndex = i;
  }
  //console.log("imgIndex: " + imgIndex);
  return imgIndex;
}

let jsonPerPicArray = [];
function resetPicJson(imgStr)
{
  resetImgIndex(imgStr);
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
function resetCenterPtList()
{
  for (let i = 0; i < )
}


let quadDots = [];
let quadDotsStr = '';
let centerPt = { x: 0, y: 0 };
const separator = ' ';
function setQuadInfo(realDots)
{
  if (realDots.length !== 4) {
    window.alert("Not enough dots to get the quadInfo.");
    return;
  }
  quadDots = realDots.slice();
  setQuadDots2ClockWise(quadDots);
  //quadDotsStr = array.join(separator); // 将数组转换为以separator分隔的字符串
  centerPt = getQuadCenterPoint(quadDots);
}


let defaultQuadIndex = -1;
import {
  setQuadDots2ClockWise,
  getQuadCenterPoint,
  parsePointString2Array,
  serializePointArray2String,
  transStr2Json,
  transJson2Str,
} from './BasicFuncs.js';
import { KEYS } from '../utils/BasicFuncs.js';
export function resetJsonProcess(jsonStr, classStr) {
  try {
    quadIndex = -1;
    resetJson(jsonStr);
    resetClassKeys(classStr.toUpperCase());
    //console.log('000');
    //resetPicJson(imgStr);
    //console.log('111');
    resetCenterPtList();
    //console.log('222');
  } catch (err) {
    window.alert('Failed to retrieve JSON data for the picture. Please check the files and try again.');
  }
}

let jsonPerPicArray = [];
let jsonPerPicPerObjKeysNum = 0;
export function resetPicJson(imgFileName) {
  resetImgIndex(imgFileName);
  if (imgIndex === -1) {
    window.alert('Unable to retrieve the image from the JSON file.');
  }

  try {
    jsonPerPicArray = json[rootKey][imgIndex][classKeys.key1];
    if (jsonPerPicArray.length > 0) jsonPerPicPerObjKeysNum = Object.keys(jsonPerPicArray[0]).length;
  } catch (err) {
    console.error('An error occurred while accessing the JSON array:', err);
  }
}
const rootKey = 'Picture';
const imgKey = 'Image Source';
const TotalClassKeys = [
  {
    class: 'DBR',
    key1: 'Barcode Info',
    key2: 'Barcode Location',
  },
  {
    class: 'DDN',
    key1: 'Quadrilateral Info',
    key2: 'Expected Quadrilateral Points',
  },
  {
    class: 'DLR',
    key1: 'Label Info',
    key2: 'Label Location',
  },
];

let classKeys = { class: '', key1: '', key2: '' };
function resetClassKeys(classStr) {
  for (let i = 0; i < 3; ++i) {
    if (TotalClassKeys[i].class === classStr) {
      classKeys = TotalClassKeys[i];
    }
  }
}

let imgIndex = -1;
function resetImgIndex(imgStr) {
  for (let i = 0; i < json[rootKey].length; ++i) {
    if (json[rootKey][i][imgKey].search(imgStr) !== -1) {
      imgIndex = i;
    }
  }
}

export function getJsonPerPicStrArray() {
  let jsonPerPicStrArray = [];
  for (let i = 0; i < jsonPerPicArray.length; i++) jsonPerPicStrArray.push(transJson2Str(jsonPerPicArray[i]));
  return jsonPerPicStrArray;
}
export function getJsonPerPicPerObjKeysNum() {
  return jsonPerPicPerObjKeysNum;
}

let json = {};
function resetJson(jsonStr) {
  json = transStr2Json(jsonStr);
}

let centerPtList = [];
const separator = ' ';
function resetCenterPtList() {
  centerPtList.splice(0, centerPtList.length);
  for (let i = 0; i < jsonPerPicArray.length; ++i) {
    const quadPts = parsePointString2Array(jsonPerPicArray[i][classKeys.key2], separator);
    const quadCenter = getQuadCenterPoint(quadPts);
    centerPtList.push(quadCenter);
  }
}

let quadDots = [];
let quadIndex = -1;
export function setQuadInfo(realDots) {
  if (realDots.length !== 4) {
    window.alert('Not enough dots to obtain the quadInfo.');
    return;
  }
  quadDots = realDots.slice();
  setQuadDots2ClockWise(quadDots);
}

export function updateQuadIndex(highlightIndex) {
  quadIndex = highlightIndex;
}

function TransQuadDots2Str(realDots) {
  let targetStr = '';
  if (realDots.length !== 4) return targetStr;
  targetStr = serializePointArray2String(realDots, separator);
  //console.log('targetStr: ' + targetStr);
  if (targetStr === '') return targetStr;
  return targetStr;
}

export function updateJson(jsonData) {
  let quadStr = TransQuadDots2Str(quadDots);
  if (quadStr === '') return 'Failed to trans dots to string.';
  try {
    jsonPerPicArray[quadIndex][classKeys.key2] = quadStr;
    json[rootKey][imgIndex][classKeys.key1] = jsonPerPicArray;
    //console.log('quadStr: ' + quadStr);
    //console.log(json);
    jsonData.str = transJson2Str(json);
    updateOtherVariablesFromJson();
  } catch (err) {
    return 'Failed to save string to json.';
  }
  return true;
}

function updateOtherVariablesFromJson() {
  jsonPerPicArray = json[rootKey][imgIndex][classKeys.key1];
  const quadPts = parsePointString2Array(jsonPerPicArray[quadIndex][classKeys.key2], separator);
  const quadCenter = getQuadCenterPoint(quadPts);
  centerPtList[quadIndex] = quadCenter;
}

export function getAdjacentImagePath(direction) {
  let newIndex;
  const totalImages = json[rootKey].length;
  if (direction === KEYS.NEXT) {
    newIndex = (imgIndex + 1) % totalImages; // 获取下一张图片的索引
  } else if (direction === KEYS.PREVIOUS) {
    newIndex = (imgIndex - 1) % totalImages; // 获取上一张图片的索引
  }
  if (newIndex < 0) {
    newIndex = totalImages - 1; // 处理索引小于0的情况
  }
  return json[rootKey][newIndex][imgKey]; // 返回对应图片的地址
}

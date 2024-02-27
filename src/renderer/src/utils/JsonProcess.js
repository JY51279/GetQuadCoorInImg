import {
  setQuadDots2ClockWise,
  getQuadCenterPoint,
  parsePointString2Array,
  serializePointArray2String,
  transStr2Json,
  transJson2Str,
} from './BasicFuncs.js';
import { KEYS, PRODUCTS } from '../utils/BasicFuncs.js';
export function resetJsonProcess(jsonData, classStr) {
  try {
    quadIndex = -1;
    resetJsonInfo(jsonData);
    resetClassKeys(classStr.toUpperCase());
    resetCenterPtList();
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
    class: PRODUCTS.DBR,
    key1: 'Barcode Info',
    key2: 'Barcode Location',
  },
  {
    class: PRODUCTS.DDN,
    key1: 'Quadrilateral Info',
    key2: 'Expected Quadrilateral Points',
  },
  {
    class: PRODUCTS.DLR,
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

export function getJsonPicNum() {
  return { picNum: imgIndex + 1, picTotalNum: json[rootKey].length };
}

export function getJsonPerPicStrArray() {
  let jsonPerPicStrArray = [];
  for (let i = 0; i < jsonPerPicArray.length; i++) jsonPerPicStrArray.push(transJson2Str(jsonPerPicArray[i]));
  return jsonPerPicStrArray;
}
export function getJsonPerPicPerObjKeysNum() {
  return jsonPerPicPerObjKeysNum;
}

let jsonFileInfo = { str: '', path: '' };
export function getJsonFileInfo() {
  jsonFileInfo.str = transJson2Str(json);
  jsonFileInfo.path = path;
  return jsonFileInfo;
}

let json = {};
let path = '';
function resetJsonInfo(jsonData) {
  json = transStr2Json(jsonData.str);
  path = jsonData.path;
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
    //console.log('Not enough dots to obtain the quadInfo.');
    return;
  }
  quadDots = realDots.slice();
  setQuadDots2ClockWise(quadDots);
}

export function updateQuadIndex(newIndex) {
  quadIndex = newIndex;
}

function TransQuadDots2Str(realDots) {
  let targetStr = '';
  if (realDots.length !== 4) return targetStr;
  targetStr = serializePointArray2String(realDots, separator);
  //console.log('targetStr: ' + targetStr);
  if (targetStr === '') return targetStr;
  return targetStr;
}

export function updateJson(action = KEYS.JSON_MODIFY) {
  let result;
  switch (action) {
    case KEYS.JSON_MODIFY:
      result = modifyJsonContent();
      break;
    case KEYS.JSON_DELETE:
      result = deleteJsonContent();
      break;
    case KEYS.JSON_ADD:
      result = addJsonContent();
      break;
    default:
      console.log('Unknown action');
      result = false;
  }
  if (result) {
    resetCenterPtList();
  }
  return result;
}

function modifyJsonContent() {
  return operateJsonContent(() => {
    let quadStr = TransQuadDots2Str(quadDots);
    if (quadStr === '') {
      return 'Failed to trans dots to string.';
    }
    if (quadIndex === -1) {
      return 'Failed to find jsonItem.';
    }
    jsonPerPicArray[quadIndex][classKeys.key2] = quadStr;
    return KEYS.OPERATE_SUCCESS;
  }, 'Failed to modify jsonItem.');
}

function deleteJsonContent() {
  return operateJsonContent(() => {
    if (quadIndex === -1) {
      return 'Failed to find jsonItem.';
    }
    jsonPerPicArray.splice(quadIndex, 1);
    return KEYS.OPERATE_SUCCESS;
  }, 'Failed to delete jsonItem.');
}

function addJsonContent() {
  return operateJsonContent(() => {
    let quadStr = TransQuadDots2Str(quadDots);
    if (quadStr === '') {
      return 'Failed to trans dots to string.';
    }
    jsonPerPicArray.push({ [classKeys.key2]: quadStr });
    return KEYS.OPERATE_SUCCESS;
  }, 'Failed to add jsonItem.');
}

function operateJsonContent(callback, errorMessage) {
  try {
    const result = callback();
    if (result === KEYS.OPERATE_SUCCESS) {
      json[rootKey][imgIndex][classKeys.key1] = jsonPerPicArray;
    }
    return result;
  } catch (err) {
    console.error(errorMessage);
    return KEYS.OPERATE_FAIL;
  }
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

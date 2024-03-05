import {
  setQuadDots2ClockWise,
  serializePointArray2String,
  transStr2Json,
  transJson2Str,
  parsePointString2Array,
} from './BasicFuncs.js';
import { KEYS, PRODUCTS } from '../utils/BasicFuncs.js';

const rootKey = 'Picture';
const imgKey = 'Image Source';
const TotalClassKeys = [
  {
    class: PRODUCTS.DBR,
    targetKey: 'Barcode Info',
    ItemKey: 'Barcode Location',
    ItemsCount: 'Barcode Count',
  },
  {
    class: PRODUCTS.DDN,
    targetKey: 'Quadrilateral Info',
    ItemKey: 'Expected Quadrilateral Points',
    ItemsCount: 'Expected Quadrilateral Count',
  },
  {
    class: PRODUCTS.DLR,
    targetKey: 'Label Info',
    ItemKey: 'Label Location',
    ItemsCount: 'Label Count',
  },
];

export function resetJsonProcess(jsonData, classStr) {
  try {
    quadIndex = -1;
    resetJsonInfo(jsonData);
    resetClassKeys(classStr.toUpperCase());
  } catch (err) {
    window.alert('Failed to retrieve JSON data. Please check the class and try again.');
  }
}

let json = {};
let path = '';
let jsonImgPathList = [];
function resetJsonInfo(jsonData) {
  json = transStr2Json(jsonData.str);
  path = jsonData.path;

  let pathList = [];
  for (let i = 0; i < json[rootKey].length; ++i) {
    pathList.push(json[rootKey][i][imgKey].replace(/[\\/]/g, '/'));
  }
  jsonImgPathList = pathList;
}

let jsonPerPicArray = [];
let jsonPerPicPerObjKeysNum = 0;
export function resetPicJson(imgFilePath, direction = '') {
  resetImgIndex(imgFilePath, direction);

  if (imgIndex === -1) {
    jsonPerPicArray.splice(0, jsonPerPicArray.length);
    window.alert('The loaded image file does not match the dataset file.');
    return false;
  }

  try {
    if (!Object.prototype.hasOwnProperty.call(json[rootKey][imgIndex], classKeys.targetKey)) {
      jsonPerPicArray.splice(0, jsonPerPicArray.length);
      window.alert('The selected product type does not match the dataset type.');
      return false;
    }
    jsonPerPicArray = json[rootKey][imgIndex][classKeys.targetKey];
    if (jsonPerPicArray.length > 0) jsonPerPicPerObjKeysNum = Object.keys(jsonPerPicArray[0]).length;
    return true;
  } catch (err) {
    console.error('An error occurred while accessing the JSON array:', err);
  }
}

let classKeys = {};
function resetClassKeys(classStr) {
  for (let i = 0; i < 3; ++i) {
    if (TotalClassKeys[i].class === classStr) {
      classKeys = TotalClassKeys[i];
    }
  }
}

let imgIndex = -1;
function resetImgIndex(imgPath, direction = '') {
  if (direction !== '') {
    imgIndex = getAdjacentImageIndex(direction);
    return;
  }

  imgPath = imgPath.replace(/[\\/]/g, '/');
  for (let i = 0; i < json[rootKey].length; ++i) {
    if (jsonImgPathList[i] === imgPath) {
      imgIndex = i;
      return;
    }
  }
  imgIndex = -1;
}

export function getJsonPicNum() {
  return { picNum: imgIndex + 1, picTotalNum: json[rootKey].length };
}

export function getJsonPerPicPointsArray() {
  let jsonPerPicPointsArray = [];
  for (let i = 0; i < jsonPerPicArray.length; i++) {
    const strTmp = jsonPerPicArray[i][classKeys.ItemKey];
    const pointsTmp = parsePointString2Array(strTmp, separator);
    jsonPerPicPointsArray.push(pointsTmp);
  }
  return jsonPerPicPointsArray;
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

let quadDots = [];
let quadIndex = -1;
export function setQuadInfo(realDots) {
  quadDots = realDots.slice();
  if (quadDots.length === 4) setQuadDots2ClockWise(quadDots);
}

export function updateQuadIndex(newIndex) {
  quadIndex = newIndex;
}

const separator = ' ';
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
    jsonPerPicArray[quadIndex][classKeys.ItemKey] = quadStr;
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
    jsonPerPicArray.push({ [classKeys.ItemKey]: quadStr });
    return KEYS.OPERATE_SUCCESS;
  }, 'Failed to add jsonItem.');
}

function operateJsonContent(callback, errorMessage) {
  try {
    const result = callback();
    if (result === KEYS.OPERATE_SUCCESS) {
      json[rootKey][imgIndex][classKeys.targetKey] = jsonPerPicArray;
      json[rootKey][imgIndex][classKeys.ItemsCount] = jsonPerPicArray.length;
    }
    return result;
  } catch (err) {
    console.error(errorMessage);
    return KEYS.OPERATE_FAIL;
  }
}

function getAdjacentImageIndex(direction) {
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
  return newIndex;
}

export function getAdjacentImagePath(direction) {
  let newIndex = getAdjacentImageIndex(direction);
  return json[rootKey][newIndex][imgKey]; // 返回对应图片的地址
}

export function getDefaultProductType(jsonPath) {
  jsonPath = jsonPath.replace(/[\\/]/g, '/');
  const pathArray = jsonPath.split('/');
  const productType = Object.values(PRODUCTS);

  let targetIndex = -1;
  for (let i = 0; i < pathArray.length; i++) {
    if (productType.includes(pathArray[i])) {
      if (targetIndex === -1) targetIndex = i;
      else return ''; //  There are many product types in the condition, so the real product type can’t be determined.
    }
  }
  if (targetIndex === -1) return '';
  return pathArray[targetIndex];
}

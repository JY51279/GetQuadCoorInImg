import {
  setQuadDots2ClockWise,
  serializePointArray2String,
  transStr2Json,
  transJson2Str,
  parsePointString2Array,
} from './BasicFuncs.js';
import { KEYS } from '../utils/BasicFuncs.js';
import { formatRepairSummary, getProductSchema, normalizeDataset } from './DatasetSchema.js';

const rootKey = 'Picture';
const imgKey = 'Image Source';
// Special case: DBR "Barcode Type": "datamatrix"

export function prepareJsonProcess(jsonData) {
  try {
    if (!jsonData || typeof jsonData.str !== 'string' || typeof jsonData.path !== 'string') {
      return { success: false, error: 'Invalid JSON file information.' };
    }

    const parsedJson = transStr2Json(jsonData.str);
    const normalizedResult = normalizeDataset(parsedJson);
    if (!normalizedResult.success) return normalizedResult;

    const preparedClassKeys = getProductSchema(normalizedResult.productType);
    const preparedImagePaths = normalizedResult.data[rootKey].map(picture =>
      picture[imgKey].replace(/[\\/]/g, '/'),
    );

    return {
      ...normalizedResult,
      success: true,
      path: jsonData.path,
      imagePaths: preparedImagePaths,
      classKeys: preparedClassKeys,
      fileInfo: {
        str: transJson2Str(normalizedResult.data),
        path: jsonData.path,
      },
      repairSummary: formatRepairSummary(normalizedResult.repairs),
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

let json = {};
let path = '';
let jsonImgPathList = [];
export function commitPreparedJsonProcess(preparedJson) {
  if (!preparedJson?.success) return false;

  json = preparedJson.data;
  path = preparedJson.path;
  jsonImgPathList = preparedJson.imagePaths;
  classKeys = preparedJson.classKeys;
  imgIndex = -1;
  quadIndex = -1;
  quadDots = [];
  jsonPerPicArray = [];
  return true;
}

export function getJsonImagePath() {
  return jsonImgPathList[imgIndex];
}

let jsonPerPicArray = [];
export function resetPicJson(imgFilePath, direction = '') {
  resetImgIndex(imgFilePath, direction);

  if (imgIndex === -1) {
    return false;
  }

  try {
    if (!Object.prototype.hasOwnProperty.call(json[rootKey][imgIndex], classKeys.targetKey)) {
      jsonPerPicArray.splice(0, jsonPerPicArray.length);
      window.alert('The selected product type does not match the dataset type.');
      return false;
    }
    jsonPerPicArray = json[rootKey][imgIndex][classKeys.targetKey];
    return true;
  } catch (err) {
    console.error('An error occurred while accessing the JSON array:', err);
  }
}

let classKeys = {};

let imgIndex = -1;
function resetImgIndex(imgPath, direction = '') {
  if (imgPath === '') {
    imgIndex = -1;
    return;
  } else if (direction !== '') {
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
  if (quadDots.length === 4) setQuadDots2ClockWise(quadDots, jsonPerPicArray[quadIndex]?.['Barcode Type'] ?? '');
}

export function updateQuadIndex(newIndex) {
  quadIndex = newIndex;
}

const separator = ' ';
function TransQuadDots2Str(realDots, initImageScale) {
  // 根据initImageScale缩放坐标，但不要修改工作图片中的原始点
  let jsonDots = realDots.map(dot => ({
    x: Math.round(dot.x / initImageScale),
    y: Math.round(dot.y / initImageScale),
  }));

  // 判断是否为一个元素，并仅修改与当前点最近的点
  if (jsonDots.length === 1) {
    let p1 = jsonDots[0];
    let dotsStr = jsonPerPicArray[quadIndex][classKeys.ItemKey];
    let dotsArray = dotsStr.split(' ').map(Number);
    let dots = [];
    for (let i = 0; i < dotsArray.length; i += 2) {
      dots.push({ x: dotsArray[i], y: dotsArray[i + 1] });
    }

    // 找到与 p1 最近的点
    let closestIndex = 0;
    let minDistance = Infinity;
    for (let i = 0; i < dots.length; i++) {
      let distance = Math.sqrt(Math.pow(dots[i].x - p1.x, 2) + Math.pow(dots[i].y - p1.y, 2));
      if (distance < minDistance) {
        minDistance = distance;
        closestIndex = i;
      }
    }

    // 替换最近的点
    dots[closestIndex] = p1;
    jsonDots = [...dots];
  }

  // 判断是否为两个元素，并补全另外两个点
  if (jsonDots.length === 2) {
    let p1 = jsonDots[0];
    let p2 = jsonDots[1];

    // 计算另外两个点
    let p3 = { x: p1.x, y: p2.y };
    let p4 = { x: p2.x, y: p1.y };

    // 将新点添加到 JSON 坐标点数组中
    jsonDots.push(p3, p4);
  }

  // 判断是否为三个元素，并补全剩余的一点
  if (jsonDots.length === 3) {
    let p1 = jsonDots[0];
    let p2 = jsonDots[1];
    let p3 = jsonDots[2];

    // 计算第四个点
    let p4 = { x: p1.x + (p3.x - p2.x), y: p1.y + (p3.y - p2.y) };

    // 将新点添加到 JSON 坐标点数组中
    jsonDots.push(p4);
  }

  let targetStr = '';
  if (jsonDots.length !== 4) return targetStr;
  const barcodeType = jsonPerPicArray[quadIndex]['Barcode Type'];
  targetStr = serializePointArray2String(jsonDots, separator, barcodeType ?? '');
  //console.log('targetStr: ' + targetStr);
  if (targetStr === '') return targetStr;
  return targetStr;
}

export function updateJson(action = KEYS.JSON_MODIFY, initImageScale) {
  let result;
  switch (action) {
    case KEYS.JSON_MODIFY:
      result = modifyJsonContent(initImageScale);
      break;
    case KEYS.JSON_DELETE:
      result = deleteJsonContent();
      break;
    case KEYS.JSON_ADD:
      result = addJsonContent(initImageScale);
      break;
    default:
      console.log('Unknown action');
      result = false;
  }
  return result;
}

function modifyJsonContent(initImageScale) {
  return operateJsonContent(() => {
    let quadStr = TransQuadDots2Str(quadDots, initImageScale);
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

function addJsonContent(initImageScale) {
  return operateJsonContent(() => {
    let quadStr = TransQuadDots2Str(quadDots, initImageScale);
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
    newIndex = Math.max(-1, imgIndex - 1) % totalImages; // 获取上一张图片的索引
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

const noKey = 'No.';
export function resetJsonNoValue() {
  if (Object.keys(json).length === 0) {
    return false;
  }

  let newNoValue = 0;
  for (let i = 0; i < json[rootKey].length; i++) {
    newNoValue++;
    json[rootKey][i][noKey] = newNoValue.toString();
  }
  return true;
}

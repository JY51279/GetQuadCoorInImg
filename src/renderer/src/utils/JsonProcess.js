import {
  setQuadDots2ClockWise,
  getQuadCenterPoint,
  parsePointString2Array,
  serializePointArray2String,
  getClosestPtIndexInArray,
  transStr2Json,
  transJson2Str,
} from './BasicFuncs.js';

export function resetJsonProcess(jsonStr, classStr, imgStr) {
  try {
    quadIndex = -1;
    resetJson(jsonStr);
    resetClassKeys(classStr.toUpperCase());
    //console.log('000');
    resetPicJson(imgStr);
    //console.log('111');
    resetCenterPtList();
    //console.log('222');
  } catch (err) {
    window.alert('Failed to reset JSON data. Please check the input and try again.');
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

let jsonPerPicArray = [];
function resetPicJson(imgStr = '') {
  if (imgStr !== '') {
    resetImgIndex(imgStr);
    if (imgIndex === -1) {
      window.alert('Unable to retrieve the image from the JSON file.');
    }
  }
  try {
    jsonPerPicArray = json[rootKey][imgIndex][classKeys.key1];
  } catch (err) {
    console.error('An error occurred while accessing the JSON array:', err);
  }
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
export function setQuadInfo(realDots, quadNumberRef) {
  if (realDots.length !== 4) {
    window.alert('Not enough dots to obtain the quadInfo.');
    return;
  }
  quadDots = realDots.slice();
  setQuadDots2ClockWise(quadDots);
  //quadDotsStr = array.join(separator); // 将数组转换为以separator分隔的字符串
  let centerPt = { x: 0, y: 0 };
  centerPt = getQuadCenterPoint(quadDots);
  quadIndex = getClosestPtIndexInArray(centerPt, centerPtList);
  quadNumberRef.value = quadIndex + 1;
  //console.log("quadIndex: " + quadIndex);
}

export function updateQuadIndex(realDots, quadNum) {
  quadDots = realDots.slice();
  quadIndex = quadNum - 1;
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
    json[rootKey][imgIndex][classKeys.key1][quadIndex][classKeys.key2] = quadStr;
    // console.log('quadStr: ' + quadStr);
    // console.log(json);
    jsonData.jsonStr = transJson2Str(json);
    resetPicJson();
  } catch (err) {
    return 'Failed to save string to json.';
  }
  return true;
}

import {
  KEYS,
  getNearestOrFarthestPointIndex,
  parsePointString2Array,
  setQuadDots2ClockWise,
  serializePointArray2String,
  transJson2Str,
  transStr2Json,
} from '../utils/BasicFuncs.js';
import { DEFAULT_LOCATION, formatRepairSummary, getProductSchema, normalizeDataset } from '../utils/DatasetSchema.js';

const ROOT_KEY = 'Picture';
const IMAGE_SOURCE_KEY = 'Image Source';
const NUMBER_KEY = 'No.';
const POINT_SEPARATOR = ' ';

const datasetState = {
  dataset: {},
  jsonFilePath: '',
  imagePaths: [],
  currentItems: [],
  productSchema: {},
  currentImageIndex: -1,
  navigationImageIndex: -1,
  selectedDots: [],
};

function clearCurrentAnnotationState() {
  datasetState.currentItems = [];
  datasetState.selectedDots = [];
}

function normalizeImagePathForComparison(imagePath) {
  const normalizedPath = imagePath.replace(/[\\/]/g, '/');
  const isWindowsPath = /^[a-zA-Z]:\//.test(normalizedPath) || normalizedPath.startsWith('//');
  return isWindowsPath ? normalizedPath.toLowerCase() : normalizedPath;
}

export function areImagePathsEquivalent(leftPath, rightPath) {
  if (typeof leftPath !== 'string' || typeof rightPath !== 'string') return false;
  return normalizeImagePathForComparison(leftPath) === normalizeImagePathForComparison(rightPath);
}

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
    const preparedImagePaths = normalizedResult.data[ROOT_KEY].map(picture =>
      picture[IMAGE_SOURCE_KEY].replace(/[\\/]/g, '/'),
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

export function commitPreparedJsonProcess(preparedJson) {
  if (!preparedJson?.success) return false;

  datasetState.dataset = preparedJson.data;
  datasetState.jsonFilePath = preparedJson.path;
  datasetState.imagePaths = preparedJson.imagePaths;
  datasetState.productSchema = preparedJson.classKeys;
  datasetState.currentImageIndex = -1;
  datasetState.navigationImageIndex = -1;
  clearCurrentAnnotationState();
  return true;
}

export function getJsonImageDialogContext() {
  const contextIndex = datasetState.currentImageIndex >= 0 ? datasetState.currentImageIndex : 0;
  return {
    jsonFilePath: datasetState.jsonFilePath,
    imagePath: datasetState.imagePaths[contextIndex] ?? '',
  };
}

export function resetPicJson(imgFilePath, requestedImgIndex = null) {
  resetImgIndex(imgFilePath, requestedImgIndex);

  if (datasetState.currentImageIndex === -1) {
    clearCurrentAnnotationState();
    return false;
  }

  try {
    const currentPicture = datasetState.dataset[ROOT_KEY][datasetState.currentImageIndex];
    if (!Object.prototype.hasOwnProperty.call(currentPicture, datasetState.productSchema.targetKey)) {
      clearCurrentAnnotationState();
      window.alert('The selected product type does not match the dataset type.');
      return false;
    }
    datasetState.currentItems = currentPicture[datasetState.productSchema.targetKey];
    datasetState.selectedDots = [];
    return true;
  } catch (err) {
    clearCurrentAnnotationState();
    console.error('An error occurred while accessing the JSON array:', err);
    return false;
  }
}

function resetImgIndex(imgPath, requestedImgIndex = null) {
  if (imgPath === '') {
    datasetState.currentImageIndex = -1;
    datasetState.navigationImageIndex = -1;
    return;
  }

  const normalizedImgPath = imgPath.replace(/[\\/]/g, '/');
  if (
    Number.isInteger(requestedImgIndex) &&
    requestedImgIndex >= 0 &&
    requestedImgIndex < datasetState.imagePaths.length &&
    areImagePathsEquivalent(datasetState.imagePaths[requestedImgIndex], normalizedImgPath)
  ) {
    datasetState.currentImageIndex = requestedImgIndex;
    datasetState.navigationImageIndex = requestedImgIndex;
    return;
  }

  for (let i = 0; i < datasetState.dataset[ROOT_KEY].length; ++i) {
    if (areImagePathsEquivalent(datasetState.imagePaths[i], normalizedImgPath)) {
      datasetState.currentImageIndex = i;
      datasetState.navigationImageIndex = i;
      return;
    }
  }
  datasetState.currentImageIndex = -1;
}

export function getJsonPicNum() {
  return {
    picNum: datasetState.currentImageIndex + 1,
    picTotalNum: datasetState.dataset[ROOT_KEY].length,
  };
}

export function getJsonPerPicPointsArray() {
  let jsonPerPicPointsArray = [];
  for (let i = 0; i < datasetState.currentItems.length; i++) {
    const strTmp = datasetState.currentItems[i][datasetState.productSchema.ItemKey];
    const pointsTmp = parsePointString2Array(strTmp, POINT_SEPARATOR);
    jsonPerPicPointsArray.push(pointsTmp);
  }
  return jsonPerPicPointsArray;
}
export function getJsonPerPicStrArray() {
  let jsonPerPicStrArray = [];
  for (let i = 0; i < datasetState.currentItems.length; i++) {
    jsonPerPicStrArray.push(transJson2Str(datasetState.currentItems[i]));
  }
  return jsonPerPicStrArray;
}
export function getJsonFileInfo() {
  return {
    str: transJson2Str(datasetState.dataset),
    path: datasetState.jsonFilePath,
  };
}

export function createDatasetMutationSnapshot() {
  return transJson2Str(datasetState.dataset);
}

export function restoreDatasetMutationSnapshot(snapshot) {
  try {
    const restoredDataset = transStr2Json(snapshot);
    if (!restoredDataset || !Array.isArray(restoredDataset[ROOT_KEY])) return false;

    const currentPicture = restoredDataset[ROOT_KEY][datasetState.currentImageIndex];
    if (
      datasetState.currentImageIndex >= 0 &&
      (!currentPicture || !Array.isArray(currentPicture[datasetState.productSchema.targetKey]))
    ) {
      return false;
    }

    datasetState.dataset = restoredDataset;
    datasetState.currentItems = currentPicture?.[datasetState.productSchema.targetKey] ?? [];
    return true;
  } catch {
    return false;
  }
}

export function setQuadInfo(realDots, activeQuadIndex = -1) {
  datasetState.selectedDots = realDots.slice();
  if (datasetState.selectedDots.length === 4) {
    setQuadDots2ClockWise(
      datasetState.selectedDots,
      datasetState.currentItems[activeQuadIndex]?.['Barcode Type'] ?? '',
    );
  }
}

function transQuadDotsToString(realDots, initImageScale, baseItem = null) {
  // 根据initImageScale缩放坐标，但不要修改工作图片中的原始点
  let jsonDots = realDots.map(dot => ({
    x: Math.round(dot.x / initImageScale),
    y: Math.round(dot.y / initImageScale),
  }));

  // 判断是否为一个元素，并仅修改与当前点最近的点
  if (jsonDots.length === 1) {
    if (!baseItem) return '';
    const newPoint = jsonDots[0];
    const currentPoints = parsePointString2Array(baseItem[datasetState.productSchema.ItemKey], POINT_SEPARATOR);
    const closestIndex = getNearestOrFarthestPointIndex(currentPoints, newPoint);
    if (closestIndex === -1) return '';

    // 替换最近的点
    currentPoints[closestIndex] = newPoint;
    jsonDots = currentPoints;
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
  const barcodeType = baseItem?.['Barcode Type'] ?? '';
  targetStr = serializePointArray2String(jsonDots, POINT_SEPARATOR, barcodeType ?? '');
  if (targetStr === '') return targetStr;
  return targetStr;
}

export function updateJson(action = KEYS.JSON_MODIFY, initImageScale, activeQuadIndex = -1) {
  let result;
  switch (action) {
    case KEYS.JSON_MODIFY:
      result = modifyJsonContent(initImageScale, activeQuadIndex);
      break;
    case KEYS.JSON_DELETE:
      result = deleteJsonContent(activeQuadIndex);
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

function modifyJsonContent(initImageScale, activeQuadIndex) {
  return operateJsonContent(() => {
    if (activeQuadIndex < 0 || activeQuadIndex >= datasetState.currentItems.length) {
      return 'Failed to find jsonItem.';
    }
    const quadStr = transQuadDotsToString(
      datasetState.selectedDots,
      initImageScale,
      datasetState.currentItems[activeQuadIndex],
    );
    if (quadStr === '') {
      return 'Failed to trans dots to string.';
    }
    datasetState.currentItems[activeQuadIndex][datasetState.productSchema.ItemKey] = quadStr;
    return KEYS.OPERATE_SUCCESS;
  }, 'Failed to modify jsonItem.');
}

function deleteJsonContent(activeQuadIndex) {
  return operateJsonContent(() => {
    if (activeQuadIndex < 0 || activeQuadIndex >= datasetState.currentItems.length) {
      return 'Failed to find jsonItem.';
    }
    datasetState.currentItems.splice(activeQuadIndex, 1);
    return KEYS.OPERATE_SUCCESS;
  }, 'Failed to delete jsonItem.');
}

function addJsonContent(initImageScale) {
  return operateJsonContent(() => {
    const newItem = createDefaultJsonItem();
    if (datasetState.selectedDots.length >= 2 && datasetState.selectedDots.length <= 4) {
      const quadStr = transQuadDotsToString(datasetState.selectedDots, initImageScale);
      if (quadStr === '') {
        return 'Failed to trans dots to string.';
      }
      newItem[datasetState.productSchema.ItemKey] = quadStr;
    } else if (datasetState.selectedDots.length > 4) {
      return 'Failed to add jsonItem: no more than 4 points are allowed.';
    }

    datasetState.currentItems.push(newItem);
    return KEYS.OPERATE_SUCCESS;
  }, 'Failed to add jsonItem.');
}

function createDefaultJsonItem() {
  const newItem = { [datasetState.productSchema.ItemKey]: DEFAULT_LOCATION };
  for (const [fieldName, fieldType] of Object.entries(datasetState.productSchema.auxiliaryFields)) {
    newItem[fieldName] = fieldType === 'array' ? [] : '';
  }
  return newItem;
}

function operateJsonContent(callback, errorMessage) {
  try {
    const result = callback();
    if (result === KEYS.OPERATE_SUCCESS) {
      const currentPicture = datasetState.dataset[ROOT_KEY][datasetState.currentImageIndex];
      currentPicture[datasetState.productSchema.targetKey] = datasetState.currentItems;
      currentPicture[datasetState.productSchema.ItemsCount] = datasetState.currentItems.length;
    }
    return result;
  } catch (err) {
    console.error(errorMessage);
    return KEYS.OPERATE_FAIL;
  }
}

function createJsonImageTarget(index) {
  if (!Array.isArray(datasetState.dataset[ROOT_KEY]) || datasetState.dataset[ROOT_KEY].length === 0) {
    return { success: false, error: 'No image data is available in the loaded JSON dataset.' };
  }
  if (!Number.isInteger(index) || index < 0 || index >= datasetState.dataset[ROOT_KEY].length) {
    return { success: false, error: 'Invalid JSON image index.' };
  }

  datasetState.navigationImageIndex = index;
  return { success: true, index, path: datasetState.imagePaths[index] };
}

export function getJsonImageTarget(index) {
  return createJsonImageTarget(index);
}

export function getAdjacentJsonImageTarget(direction) {
  if (!Array.isArray(datasetState.dataset[ROOT_KEY]) || datasetState.dataset[ROOT_KEY].length === 0) {
    return { success: false, error: 'No image data is available in the loaded JSON dataset.' };
  }

  const totalImages = datasetState.dataset[ROOT_KEY].length;
  const baseIndex =
    datasetState.navigationImageIndex >= 0 ? datasetState.navigationImageIndex : datasetState.currentImageIndex;
  if (direction === KEYS.NEXT) {
    return createJsonImageTarget((baseIndex + 1) % totalImages);
  }
  if (direction === KEYS.PREVIOUS) {
    const previousIndex = baseIndex < 0 ? totalImages - 1 : (baseIndex - 1 + totalImages) % totalImages;
    return createJsonImageTarget(previousIndex);
  }
  return { success: false, error: 'Invalid JSON image navigation direction.' };
}

export function resetJsonNoValue() {
  if (Object.keys(datasetState.dataset).length === 0) {
    return false;
  }

  let newNoValue = 0;
  for (let i = 0; i < datasetState.dataset[ROOT_KEY].length; i++) {
    newNoValue++;
    datasetState.dataset[ROOT_KEY][i][NUMBER_KEY] = newNoValue.toString();
  }
  return true;
}

import cloneDeep from 'lodash/cloneDeep';
import {
  KEYS,
  getNearestOrFarthestPointIndex,
  parsePointString2Array,
  transJson2Str,
  transStr2Json,
} from '../utils/BasicFuncs.js';
import {
  DEFAULT_LOCATION,
  formatLossyRepairSummary,
  formatRepairSummary,
  getProductSchema,
  normalizeDataset,
} from '../utils/DatasetSchema.js';
import { imagePointToDatasetPoint } from '../utils/AnnotationCoordinates.js';
import { prepareQuadPointUpdate, sortQuadPointsClockwise } from '../utils/QuadGeometry.js';

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
};

function clearCurrentAnnotationState() {
  datasetState.currentItems = [];
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

export function prepareJsonProcess(jsonData, { allowLossyRepairs = false } = {}) {
  try {
    if (!jsonData || typeof jsonData.str !== 'string' || typeof jsonData.path !== 'string') {
      return { success: false, error: 'Invalid JSON file information.' };
    }

    const parsedJson = transStr2Json(jsonData.str);
    const normalizedResult = normalizeDataset(parsedJson, { allowLossyRepairs });
    if (!normalizedResult.success) return normalizedResult;

    if (normalizedResult.requiresLossyRepair) {
      return {
        ...normalizedResult,
        success: true,
        path: jsonData.path,
        lossyRepairSummary: formatLossyRepairSummary(normalizedResult.lossyIssues),
      };
    }

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
      lossyRepairsApplied: allowLossyRepairs && normalizedResult.lossyIssues.length > 0,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

export function commitPreparedJsonProcess(preparedJson) {
  if (
    !preparedJson?.success ||
    preparedJson.requiresLossyRepair ||
    !preparedJson.data ||
    !Array.isArray(preparedJson.imagePaths) ||
    !preparedJson.classKeys
  ) {
    return false;
  }

  datasetState.dataset = preparedJson.data;
  datasetState.jsonFilePath = preparedJson.path;
  datasetState.imagePaths = preparedJson.imagePaths;
  datasetState.productSchema = preparedJson.classKeys;
  datasetState.currentImageIndex = -1;
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
  const resolvedImageIndex = findImageIndex(imgFilePath, requestedImgIndex);
  if (resolvedImageIndex === -1) {
    datasetState.currentImageIndex = -1;
    clearCurrentAnnotationState();
    return {
      success: false,
      error: imgFilePath
        ? `No JSON data found for image path:\n${imgFilePath}`
        : 'No JSON data found for the current image.',
    };
  }

  try {
    const currentPicture = datasetState.dataset[ROOT_KEY][resolvedImageIndex];
    if (!Object.prototype.hasOwnProperty.call(currentPicture, datasetState.productSchema.targetKey)) {
      datasetState.currentImageIndex = -1;
      clearCurrentAnnotationState();
      return { success: false, error: 'The selected product type does not match the dataset type.' };
    }
    datasetState.currentImageIndex = resolvedImageIndex;
    datasetState.currentItems = currentPicture[datasetState.productSchema.targetKey];
    return { success: true, index: resolvedImageIndex };
  } catch (err) {
    datasetState.currentImageIndex = -1;
    clearCurrentAnnotationState();
    console.error('An error occurred while accessing the JSON array:', err);
    return { success: false, error: 'Failed to access the matching JSON image item.' };
  }
}

function findImageIndex(imgPath, requestedImgIndex = null) {
  if (imgPath === '') return -1;

  const normalizedImgPath = imgPath.replace(/[\\/]/g, '/');
  if (
    Number.isInteger(requestedImgIndex) &&
    requestedImgIndex >= 0 &&
    requestedImgIndex < datasetState.imagePaths.length &&
    areImagePathsEquivalent(datasetState.imagePaths[requestedImgIndex], normalizedImgPath)
  ) {
    return requestedImgIndex;
  }

  for (let i = 0; i < datasetState.dataset[ROOT_KEY].length; ++i) {
    if (areImagePathsEquivalent(datasetState.imagePaths[i], normalizedImgPath)) {
      return i;
    }
  }
  return -1;
}

export function getCurrentJsonImageIndex() {
  return datasetState.currentImageIndex;
}

export function getJsonImagePosition() {
  const pictures = datasetState.dataset[ROOT_KEY];
  return {
    currentIndex: datasetState.currentImageIndex,
    total: Array.isArray(pictures) ? pictures.length : 0,
  };
}

export function getCurrentAnnotationView() {
  return {
    formattedItems: datasetState.currentItems.map(item => transJson2Str(item)),
    quads: datasetState.currentItems.map(item =>
      parsePointString2Array(item[datasetState.productSchema.ItemKey], POINT_SEPARATOR),
    ),
  };
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

function prepareSelectedDots(realDots, activeQuadIndex) {
  const selectedDots = Array.isArray(realDots) ? realDots.map(dot => ({ ...dot })) : [];
  if (selectedDots.length === 4) {
    sortQuadPointsClockwise(selectedDots, datasetState.currentItems[activeQuadIndex]?.['Barcode Type'] ?? '');
  }
  return selectedDots;
}

function serializeQuadPoints(points, separator, barcodeType = '') {
  const normalizedPoints = points.map(point => ({ ...point }));
  if (!sortQuadPointsClockwise(normalizedPoints, barcodeType)) return '';
  return normalizedPoints.map(point => `${point.x} ${point.y}`).join(separator);
}

function transQuadDotsToString(realDots, coordinateScale, baseItem = null) {
  // 根据显示图相对原图的横纵缩放比例换算坐标，但不要修改工作图片中的原始点
  let jsonDots = realDots.map(dot => imagePointToDatasetPoint(dot, coordinateScale));
  if (jsonDots.some(dot => dot === null)) return '';

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
  targetStr = serializeQuadPoints(jsonDots, POINT_SEPARATOR, barcodeType);
  if (targetStr === '') return targetStr;
  return targetStr;
}

export function updateJson(action = KEYS.JSON_MODIFY, coordinateScale, activeQuadIndex = -1, realDots = []) {
  const selectedDots = prepareSelectedDots(realDots, activeQuadIndex);
  let result;
  switch (action) {
    case KEYS.JSON_MODIFY:
      result = modifyJsonContent(coordinateScale, activeQuadIndex, selectedDots);
      break;
    case KEYS.JSON_DELETE:
      result = deleteJsonContent(activeQuadIndex);
      break;
    case KEYS.JSON_ADD:
      result = addJsonContent(coordinateScale, selectedDots);
      break;
    default:
      console.log('Unknown action');
      result = false;
  }
  return result;
}

function jsonValuesEqual(leftValue, rightValue) {
  return transJson2Str(leftValue) === transJson2Str(rightValue);
}

function runJsonMutationWithHistory(action, itemIndex, mutate) {
  if (datasetState.currentImageIndex < 0) {
    return { success: false, error: 'No JSON image is currently active.' };
  }

  const beforeItem =
    action !== KEYS.JSON_ADD &&
    Number.isInteger(itemIndex) &&
    itemIndex >= 0 &&
    itemIndex < datasetState.currentItems.length
      ? cloneDeep(datasetState.currentItems[itemIndex])
      : null;
  const result = mutate();
  if (result !== KEYS.OPERATE_SUCCESS) return { success: false, error: result };

  const afterItem =
    action !== KEYS.JSON_DELETE &&
    Number.isInteger(itemIndex) &&
    itemIndex >= 0 &&
    itemIndex < datasetState.currentItems.length
      ? cloneDeep(datasetState.currentItems[itemIndex])
      : null;
  const changed = !jsonValuesEqual(beforeItem, afterItem);

  return {
    success: true,
    historyEntry: changed
      ? {
          action,
          imageIndex: datasetState.currentImageIndex,
          itemIndex,
          beforeItem,
          afterItem,
        }
      : null,
  };
}

export function updateJsonWithHistory(action = KEYS.JSON_MODIFY, coordinateScale, activeQuadIndex = -1, realDots = []) {
  const itemIndex = action === KEYS.JSON_ADD ? datasetState.currentItems.length : activeQuadIndex;
  return runJsonMutationWithHistory(action, itemIndex, () =>
    updateJson(action, coordinateScale, activeQuadIndex, realDots),
  );
}

function updateQuadPoint(activeQuadIndex, pointIndex, nextPoint) {
  return operateJsonContent(() => {
    if (activeQuadIndex < 0 || activeQuadIndex >= datasetState.currentItems.length) {
      return 'Failed to find jsonItem.';
    }

    const targetItem = datasetState.currentItems[activeQuadIndex];
    const currentPoints = parsePointString2Array(targetItem[datasetState.productSchema.ItemKey], POINT_SEPARATOR);
    const preparedPoints = prepareQuadPointUpdate(
      currentPoints,
      pointIndex,
      nextPoint,
      targetItem['Barcode Type'] ?? '',
    );
    if (!preparedPoints.success) return preparedPoints.error;

    targetItem[datasetState.productSchema.ItemKey] = preparedPoints.points
      .map(point => `${point.x} ${point.y}`)
      .join(POINT_SEPARATOR);
    return KEYS.OPERATE_SUCCESS;
  }, 'Failed to update the dragged Quad point.');
}

export function updateQuadPointWithHistory(activeQuadIndex = -1, pointIndex = -1, nextPoint = null) {
  return runJsonMutationWithHistory(KEYS.JSON_MODIFY, activeQuadIndex, () =>
    updateQuadPoint(activeQuadIndex, pointIndex, nextPoint),
  );
}

export function applyJsonHistoryEntry(historyEntry, direction) {
  const isUndo = direction === 'undo';
  const isRedo = direction === 'redo';
  if (!historyEntry || (!isUndo && !isRedo)) {
    return { success: false, error: 'Invalid JSON history operation.' };
  }

  const { imageIndex, itemIndex, beforeItem, afterItem } = historyEntry;
  const pictures = datasetState.dataset[ROOT_KEY];
  const picture = Array.isArray(pictures) ? pictures[imageIndex] : null;
  const items = picture?.[datasetState.productSchema.targetKey];
  if (!Number.isInteger(itemIndex) || itemIndex < 0 || !Array.isArray(items)) {
    return { success: false, error: 'The JSON history no longer matches the current dataset.' };
  }

  const expectedItem = isUndo ? afterItem : beforeItem;
  const targetItem = isUndo ? beforeItem : afterItem;
  let mutationType;

  if (targetItem === null) {
    if (itemIndex >= items.length || !jsonValuesEqual(items[itemIndex], expectedItem)) {
      return { success: false, error: 'The JSON item to remove no longer matches its history.' };
    }
    items.splice(itemIndex, 1);
    mutationType = 'delete';
  } else if (expectedItem === null) {
    if (itemIndex > items.length) {
      return { success: false, error: 'The JSON insertion position no longer matches its history.' };
    }
    items.splice(itemIndex, 0, cloneDeep(targetItem));
    mutationType = 'insert';
  } else {
    if (itemIndex >= items.length || !jsonValuesEqual(items[itemIndex], expectedItem)) {
      return { success: false, error: 'The JSON item to replace no longer matches its history.' };
    }
    items.splice(itemIndex, 1, cloneDeep(targetItem));
    mutationType = 'replace';
  }

  picture[datasetState.productSchema.ItemsCount] = items.length;
  if (imageIndex === datasetState.currentImageIndex) datasetState.currentItems = items;

  return {
    success: true,
    action: historyEntry.action,
    itemIndex,
    mutationType,
    activeQuadIndex: mutationType === 'delete' ? Math.min(itemIndex, items.length - 1) : itemIndex,
  };
}

function modifyJsonContent(coordinateScale, activeQuadIndex, selectedDots) {
  return operateJsonContent(() => {
    if (activeQuadIndex < 0 || activeQuadIndex >= datasetState.currentItems.length) {
      return 'Failed to find jsonItem.';
    }
    const quadStr = transQuadDotsToString(selectedDots, coordinateScale, datasetState.currentItems[activeQuadIndex]);
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

function addJsonContent(coordinateScale, selectedDots) {
  return operateJsonContent(() => {
    const newItem = createDefaultJsonItem();
    if (selectedDots.length >= 2 && selectedDots.length <= 4) {
      const quadStr = transQuadDotsToString(selectedDots, coordinateScale);
      if (quadStr === '') {
        return 'Failed to trans dots to string.';
      }
      newItem[datasetState.productSchema.ItemKey] = quadStr;
    } else if (selectedDots.length > 4) {
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

  return { success: true, index, path: datasetState.imagePaths[index] };
}

export function getJsonImageTarget(index) {
  return createJsonImageTarget(index);
}

export function getAdjacentJsonImageTarget(direction, baseIndex = datasetState.currentImageIndex) {
  if (!Array.isArray(datasetState.dataset[ROOT_KEY]) || datasetState.dataset[ROOT_KEY].length === 0) {
    return { success: false, error: 'No image data is available in the loaded JSON dataset.' };
  }

  const totalImages = datasetState.dataset[ROOT_KEY].length;
  if (!Number.isInteger(baseIndex) || baseIndex < -1 || baseIndex >= totalImages) {
    return { success: false, error: 'Invalid JSON image index.' };
  }
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

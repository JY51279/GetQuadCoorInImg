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
import { prepareQuad, prepareQuadPointUpdate } from '../utils/QuadGeometry.js';
import { HISTORY_DIRECTION } from './UndoRedoHistory.js';

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

function prepareDatasetQuad(realDots, coordinateScale, baseItem = null) {
  // 根据显示图相对原图的横纵缩放比例换算坐标，但不要修改工作图片中的原始点
  const jsonDots = realDots.map(dot => imagePointToDatasetPoint(dot, coordinateScale));
  if (jsonDots.some(dot => dot === null)) {
    return { success: false, error: 'Failed to map the selected points to valid dataset coordinates.' };
  }

  // 判断是否为一个元素，并仅修改与当前点最近的点
  if (jsonDots.length === 1) {
    if (!baseItem) {
      return { success: false, error: 'At least two selected points are required to create a Quad.' };
    }
    const newPoint = jsonDots[0];
    const currentPoints = parsePointString2Array(baseItem[datasetState.productSchema.ItemKey], POINT_SEPARATOR);
    const closestIndex = getNearestOrFarthestPointIndex(currentPoints, newPoint);
    if (closestIndex === -1) {
      return { success: false, error: 'Failed to find the nearest Quad point.' };
    }
    return prepareQuadPointUpdate(
      currentPoints,
      closestIndex,
      newPoint,
      baseItem['Barcode Type'] ?? '',
    );
  }

  const barcodeType = baseItem?.['Barcode Type'] ?? '';
  return prepareQuad(jsonDots, barcodeType);
}

function serializePreparedQuad(points) {
  return points.map(point => `${point.x} ${point.y}`).join(POINT_SEPARATOR);
}

export function updateJson(action = KEYS.JSON_MODIFY, coordinateScale, activeQuadIndex = -1, realDots = []) {
  const selectedDots = Array.isArray(realDots) ? realDots.map(dot => ({ ...dot })) : [];
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

function isHistoryDirection(direction) {
  return direction === HISTORY_DIRECTION.UNDO || direction === HISTORY_DIRECTION.REDO;
}

function createDatasetMutationReceipt(entries, direction) {
  if (!Array.isArray(entries) || entries.length === 0 || !isHistoryDirection(direction)) return null;
  return Object.freeze({ entries: Object.freeze([...entries]), direction });
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
  const historyEntry = changed
    ? {
        action,
        imageIndex: datasetState.currentImageIndex,
        itemIndex,
        beforeItem,
        afterItem,
      }
    : null;

  return {
    success: true,
    changed,
    historyEntry,
    receipt: createDatasetMutationReceipt(historyEntry ? [historyEntry] : [], HISTORY_DIRECTION.REDO),
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

    targetItem[datasetState.productSchema.ItemKey] = serializePreparedQuad(preparedPoints.points);
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

export function rollbackDatasetMutation(receipt) {
  if (!receipt || !Array.isArray(receipt.entries) || !isHistoryDirection(receipt.direction)) {
    return { success: false, error: 'Invalid dataset mutation receipt.' };
  }

  const rollbackDirection =
    receipt.direction === HISTORY_DIRECTION.UNDO ? HISTORY_DIRECTION.REDO : HISTORY_DIRECTION.UNDO;
  const mutationResults = [];
  for (const historyEntry of receipt.entries.toReversed()) {
    const mutationResult = applyJsonHistoryEntry(historyEntry, rollbackDirection);
    if (!mutationResult.success) {
      return {
        success: false,
        error: `Failed to roll back a dataset mutation: ${mutationResult.error}`,
        mutationResults,
      };
    }
    mutationResults.push(mutationResult);
  }

  return { success: true, mutationResults };
}

export function applyJsonHistoryEntriesWithReceipt(historyEntries, direction) {
  if (!Array.isArray(historyEntries) || !isHistoryDirection(direction)) {
    return { success: false, error: 'Invalid JSON history transition.', rollbackFailed: false };
  }
  if (historyEntries.length === 0) {
    return { success: true, changed: false, receipt: null, mutationResults: [] };
  }

  const appliedEntries = [];
  const mutationResults = [];
  for (const historyEntry of historyEntries) {
    const mutationResult = applyJsonHistoryEntry(historyEntry, direction);
    if (!mutationResult.success) {
      const receipt = createDatasetMutationReceipt(appliedEntries, direction);
      const rollbackResult = receipt ? rollbackDatasetMutation(receipt) : { success: true };
      return {
        success: false,
        error: mutationResult.error,
        rollbackFailed: !rollbackResult.success,
      };
    }
    appliedEntries.push(historyEntry);
    mutationResults.push(mutationResult);
  }

  return {
    success: true,
    changed: true,
    receipt: createDatasetMutationReceipt(appliedEntries, direction),
    mutationResults,
  };
}

function modifyJsonContent(coordinateScale, activeQuadIndex, selectedDots) {
  return operateJsonContent(() => {
    if (activeQuadIndex < 0 || activeQuadIndex >= datasetState.currentItems.length) {
      return 'Failed to find jsonItem.';
    }
    const targetItem = datasetState.currentItems[activeQuadIndex];
    const preparedQuad = prepareDatasetQuad(selectedDots, coordinateScale, targetItem);
    if (!preparedQuad.success) return preparedQuad.error;
    targetItem[datasetState.productSchema.ItemKey] = serializePreparedQuad(preparedQuad.points);
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
    if (selectedDots.length > 0) {
      const preparedQuad = prepareDatasetQuad(selectedDots, coordinateScale);
      if (!preparedQuad.success) return preparedQuad.error;
      newItem[datasetState.productSchema.ItemKey] = serializePreparedQuad(preparedQuad.points);
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

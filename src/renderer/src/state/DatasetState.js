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
import {
  QUAD_TRANSLATION_TARGET,
  calculateClampedQuadTranslation,
  normalizeQuadTranslationTarget,
  prepareQuad,
  prepareQuadPointUpdate,
} from '../utils/QuadGeometry.js';
import { HISTORY_DIRECTION } from './UndoRedoHistory.js';
import { toUserErrorMessage } from '../../../shared/UserMessages.js';

const ROOT_KEY = 'Picture';
const IMAGE_SOURCE_KEY = 'Image Source';
const NUMBER_KEY = 'No.';
const POINT_SEPARATOR = ' ';
const TRANSLATION_ACTION_BY_TARGET_TYPE = Object.freeze({
  [QUAD_TRANSLATION_TARGET.WHOLE]: KEYS.JSON_TRANSLATE_QUAD,
  [QUAD_TRANSLATION_TARGET.EDGE]: KEYS.JSON_TRANSLATE_QUAD_EDGE,
});

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
      return { success: false, error: 'JSON 文件信息无效。' };
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
    return { success: false, error: toUserErrorMessage(err, '解析 JSON 数据失败。') };
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
        ? `找不到与以下图片路径匹配的 JSON 数据：\n${imgFilePath}`
        : '找不到与当前图片匹配的 JSON 数据。',
    };
  }

  try {
    const currentPicture = datasetState.dataset[ROOT_KEY][resolvedImageIndex];
    if (!Object.prototype.hasOwnProperty.call(currentPicture, datasetState.productSchema.targetKey)) {
      datasetState.currentImageIndex = -1;
      clearCurrentAnnotationState();
      return { success: false, error: '所选产品类型与数据集类型不匹配。' };
    }
    datasetState.currentImageIndex = resolvedImageIndex;
    datasetState.currentItems = currentPicture[datasetState.productSchema.targetKey];
    return { success: true, index: resolvedImageIndex };
  } catch (err) {
    datasetState.currentImageIndex = -1;
    clearCurrentAnnotationState();
    console.error('An error occurred while accessing the JSON array:', err);
    return { success: false, error: '无法访问匹配的 JSON 图片项。' };
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

export function getJsonFilePath() {
  return datasetState.jsonFilePath;
}

function prepareDatasetQuad(realDots, coordinateScale, baseItem = null) {
  // 根据显示图相对原图的横纵缩放比例换算坐标，但不要修改工作图片中的原始点
  const jsonDots = realDots.map(dot => imagePointToDatasetPoint(dot, coordinateScale));
  if (jsonDots.some(dot => dot === null)) {
    return { success: false, error: '无法将所选点换算为有效的数据集坐标。' };
  }

  // 判断是否为一个元素，并仅修改与当前点最近的点
  if (jsonDots.length === 1) {
    if (!baseItem) {
      return { success: false, error: '创建 Quad 至少需要选择两个点。' };
    }
    const newPoint = jsonDots[0];
    const currentPoints = parsePointString2Array(baseItem[datasetState.productSchema.ItemKey], POINT_SEPARATOR);
    const closestIndex = getNearestOrFarthestPointIndex(currentPoints, newPoint);
    if (closestIndex === -1) {
      return { success: false, error: '无法找到最近的 Quad 顶点。' };
    }
    return prepareQuadPointUpdate(currentPoints, closestIndex, newPoint, baseItem['Barcode Type'] ?? '');
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

function getHistoryStepMutations(historyEntry, direction) {
  const mutations = Array.isArray(historyEntry?.mutations) ? historyEntry.mutations : [historyEntry];
  return direction === HISTORY_DIRECTION.UNDO ? mutations.toReversed() : mutations;
}

function runJsonMutationWithHistory(action, itemIndex, mutate) {
  if (datasetState.currentImageIndex < 0) {
    return { success: false, error: '当前没有激活的 JSON 图片。' };
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
      return '找不到对应的 JSON 标注项。';
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
  }, '更新拖动后的 Quad 顶点失败。');
}

export function updateQuadPointWithHistory(activeQuadIndex = -1, pointIndex = -1, nextPoint = null) {
  return runJsonMutationWithHistory(KEYS.JSON_MODIFY, activeQuadIndex, () =>
    updateQuadPoint(activeQuadIndex, pointIndex, nextPoint),
  );
}

function normalizeImageSize(imageSize) {
  const width = imageSize?.width;
  const height = imageSize?.height;
  if (!Number.isSafeInteger(width) || width <= 0 || !Number.isSafeInteger(height) || height <= 0) return null;
  return { width, height };
}

function replaceQuadLocation(activeQuadIndex, points, imageSize) {
  return operateJsonContent(() => {
    if (activeQuadIndex < 0 || activeQuadIndex >= datasetState.currentItems.length) {
      return '找不到对应的 JSON 标注项。';
    }

    const normalizedImageSize = normalizeImageSize(imageSize);
    if (normalizedImageSize === null) return '当前图片的原始尺寸无效。';

    const targetItem = datasetState.currentItems[activeQuadIndex];
    const preparedQuad = prepareQuad(points, targetItem['Barcode Type'] ?? '');
    if (!preparedQuad.success) return preparedQuad.error;
    if (
      preparedQuad.points.some(
        point =>
          point.x < 0 || point.x >= normalizedImageSize.width || point.y < 0 || point.y >= normalizedImageSize.height,
      )
    ) {
      return 'Quad 坐标超出当前图片边界。';
    }

    targetItem[datasetState.productSchema.ItemKey] = serializePreparedQuad(preparedQuad.points);
    return KEYS.OPERATE_SUCCESS;
  }, '替换 Quad 坐标失败。');
}

export function replaceQuadLocationWithHistory(activeQuadIndex = -1, points = [], imageSize = null) {
  return runJsonMutationWithHistory(KEYS.JSON_MODIFY, activeQuadIndex, () =>
    replaceQuadLocation(activeQuadIndex, points, imageSize),
  );
}

export function translateQuadWithHistory({ quadIndex = -1, target, delta = null, imageSize = null } = {}) {
  const normalizedTarget = normalizeQuadTranslationTarget(target);
  if (normalizedTarget === null) return { success: false, error: 'Quad 平移目标无效。' };

  return runJsonMutationWithHistory(TRANSLATION_ACTION_BY_TARGET_TYPE[normalizedTarget.type], quadIndex, () => {
    if (quadIndex < 0 || quadIndex >= datasetState.currentItems.length) {
      return '找不到对应的 JSON 标注项。';
    }

    const targetItem = datasetState.currentItems[quadIndex];
    const currentPoints = parsePointString2Array(targetItem[datasetState.productSchema.ItemKey], POINT_SEPARATOR);
    const translation = calculateClampedQuadTranslation(currentPoints, delta, imageSize, normalizedTarget);
    if (translation === null) return '无法计算 Quad 平移坐标。';
    return replaceQuadLocation(quadIndex, translation.points, imageSize);
  });
}

export function copyPreviousQuadLocationWithHistory(activeQuadIndex = -1, imageSize = null) {
  if (datasetState.currentImageIndex <= 0) {
    return { success: false, error: '当前图片没有上一张图片可供沿用坐标。' };
  }
  if (activeQuadIndex < 0 || activeQuadIndex >= datasetState.currentItems.length) {
    return { success: false, error: '当前没有激活有效的 Quad。' };
  }

  const previousPicture = datasetState.dataset[ROOT_KEY]?.[datasetState.currentImageIndex - 1];
  const previousItems = previousPicture?.[datasetState.productSchema.targetKey];
  if (!Array.isArray(previousItems) || activeQuadIndex >= previousItems.length) {
    return { success: false, error: '上一张图片中没有同下标的 Quad。' };
  }

  const sourceLocation = previousItems[activeQuadIndex]?.[datasetState.productSchema.ItemKey];
  if (typeof sourceLocation !== 'string') {
    return { success: false, error: '上一张图片对应 Quad 的坐标无效。' };
  }

  const sourcePoints = parsePointString2Array(sourceLocation, POINT_SEPARATOR);
  return runJsonMutationWithHistory(KEYS.JSON_COPY_PREVIOUS_LOCATION, activeQuadIndex, () =>
    replaceQuadLocation(activeQuadIndex, sourcePoints, imageSize),
  );
}

export function resolveFollowingImageIndexes({ sourceImageIndex, count } = {}) {
  const pictures = datasetState.dataset[ROOT_KEY];
  const totalImages = Array.isArray(pictures) ? pictures.length : 0;
  if (!Number.isInteger(sourceImageIndex) || sourceImageIndex < 0 || sourceImageIndex >= totalImages) {
    return { success: false, error: '源图片序号无效。' };
  }

  const remainingCount = totalImages - sourceImageIndex - 1;
  if (remainingCount === 0) return { success: false, error: '当前图片之后没有可应用坐标的图片。' };
  if (!Number.isInteger(count) || count < 1) return { success: false, error: '后续图片数量必须是正整数。' };

  const resolvedCount = Math.min(count, remainingCount);

  return {
    success: true,
    imageIndexes: Array.from({ length: resolvedCount }, (_, offset) => sourceImageIndex + offset + 1),
    remainingCount,
  };
}

function normalizeTargetImageIndexes(targetImageIndexes, sourceImageIndex, pictureCount) {
  if (!Array.isArray(targetImageIndexes)) return null;

  const normalizedIndexes = [];
  const seenIndexes = new Set();
  for (const imageIndex of targetImageIndexes) {
    if (
      !Number.isInteger(imageIndex) ||
      imageIndex < 0 ||
      imageIndex >= pictureCount ||
      imageIndex === sourceImageIndex
    ) {
      return null;
    }
    if (seenIndexes.has(imageIndex)) continue;
    seenIndexes.add(imageIndex);
    normalizedIndexes.push(imageIndex);
  }
  return normalizedIndexes;
}

export function applyQuadLocationToImagesWithHistory({ source, targetImageIndexes } = {}) {
  const sourceImageIndex = source?.imageIndex;
  const quadIndex = source?.quadIndex;
  const pictures = datasetState.dataset[ROOT_KEY];
  if (!Array.isArray(pictures) || pictures.length === 0) {
    return { success: false, error: '当前 JSON 数据集中没有可用的图片数据。' };
  }
  if (!Number.isInteger(sourceImageIndex) || sourceImageIndex < 0 || sourceImageIndex >= pictures.length) {
    return { success: false, error: '源图片序号无效。' };
  }
  if (sourceImageIndex !== datasetState.currentImageIndex) {
    return { success: false, error: '源图片已与当前图片不一致。' };
  }

  const normalizedTargetIndexes = normalizeTargetImageIndexes(targetImageIndexes, sourceImageIndex, pictures.length);
  if (normalizedTargetIndexes === null || normalizedTargetIndexes.length === 0) {
    return { success: false, error: '目标图片序号无效。' };
  }

  const sourceItems = pictures[sourceImageIndex]?.[datasetState.productSchema.targetKey];
  if (!Number.isInteger(quadIndex) || quadIndex < 0 || !Array.isArray(sourceItems) || quadIndex >= sourceItems.length) {
    return { success: false, error: '当前没有激活有效的 Quad。' };
  }

  const sourceLocation = sourceItems[quadIndex]?.[datasetState.productSchema.ItemKey];
  if (typeof sourceLocation !== 'string') {
    return { success: false, error: '当前 Quad 的坐标无效。' };
  }

  const mutations = [];
  const skippedImageIndexes = [];
  let unchangedCount = 0;
  for (const imageIndex of normalizedTargetIndexes) {
    const targetItems = pictures[imageIndex]?.[datasetState.productSchema.targetKey];
    if (!Array.isArray(targetItems) || quadIndex >= targetItems.length) {
      skippedImageIndexes.push(imageIndex);
      continue;
    }

    const targetItem = targetItems[quadIndex];
    if (!targetItem || typeof targetItem !== 'object') {
      return { success: false, error: `图片 ${imageIndex + 1} 的对应 Quad 数据无效。` };
    }
    if (targetItem[datasetState.productSchema.ItemKey] === sourceLocation) {
      unchangedCount++;
      continue;
    }

    const afterItem = cloneDeep(targetItem);
    afterItem[datasetState.productSchema.ItemKey] = sourceLocation;
    mutations.push({
      action: KEYS.JSON_APPLY_QUAD_LOCATION,
      imageIndex,
      itemIndex: quadIndex,
      beforeItem: cloneDeep(targetItem),
      afterItem,
    });
  }

  const summary = {
    requestedCount: normalizedTargetIndexes.length,
    updatedCount: mutations.length,
    unchangedCount,
    skippedImageIndexes,
  };
  if (mutations.length === 0) {
    return { success: true, changed: false, historyEntry: null, receipt: null, summary };
  }

  const mutationResult = applyJsonHistoryEntriesWithReceipt(mutations, HISTORY_DIRECTION.REDO);
  if (!mutationResult.success) return { ...mutationResult, summary };

  return {
    ...mutationResult,
    historyEntry: {
      action: KEYS.JSON_APPLY_QUAD_LOCATION,
      imageIndex: sourceImageIndex,
      itemIndex: quadIndex,
      mutations,
      targetImageIndexes: normalizedTargetIndexes,
    },
    summary,
  };
}

export function applyJsonHistoryEntry(historyEntry, direction) {
  const isUndo = direction === 'undo';
  const isRedo = direction === 'redo';
  if (!historyEntry || (!isUndo && !isRedo)) {
    return { success: false, error: 'JSON 历史操作无效。' };
  }

  const { imageIndex, itemIndex, beforeItem, afterItem } = historyEntry;
  const pictures = datasetState.dataset[ROOT_KEY];
  const picture = Array.isArray(pictures) ? pictures[imageIndex] : null;
  const items = picture?.[datasetState.productSchema.targetKey];
  if (!Number.isInteger(itemIndex) || itemIndex < 0 || !Array.isArray(items)) {
    return { success: false, error: 'JSON 历史记录已与当前数据集不一致。' };
  }

  const expectedItem = isUndo ? afterItem : beforeItem;
  const targetItem = isUndo ? beforeItem : afterItem;
  let mutationType;

  if (targetItem === null) {
    if (itemIndex >= items.length || !jsonValuesEqual(items[itemIndex], expectedItem)) {
      return { success: false, error: '待删除的 JSON 标注项已与历史记录不一致。' };
    }
    items.splice(itemIndex, 1);
    mutationType = 'delete';
  } else if (expectedItem === null) {
    if (itemIndex > items.length) {
      return { success: false, error: 'JSON 插入位置已与历史记录不一致。' };
    }
    items.splice(itemIndex, 0, cloneDeep(targetItem));
    mutationType = 'insert';
  } else {
    if (itemIndex >= items.length || !jsonValuesEqual(items[itemIndex], expectedItem)) {
      return { success: false, error: '待替换的 JSON 标注项已与历史记录不一致。' };
    }
    items.splice(itemIndex, 1, cloneDeep(targetItem));
    mutationType = 'replace';
  }

  picture[datasetState.productSchema.ItemsCount] = items.length;
  if (imageIndex === datasetState.currentImageIndex) datasetState.currentItems = items;

  return {
    success: true,
    action: historyEntry.action,
    imageIndex,
    itemIndex,
    mutationType,
    activeQuadIndex: mutationType === 'delete' ? Math.min(itemIndex, items.length - 1) : itemIndex,
  };
}

export function rollbackDatasetMutation(receipt) {
  if (!receipt || !Array.isArray(receipt.entries) || !isHistoryDirection(receipt.direction)) {
    return { success: false, error: '数据集变更记录无效。' };
  }

  const rollbackDirection =
    receipt.direction === HISTORY_DIRECTION.UNDO ? HISTORY_DIRECTION.REDO : HISTORY_DIRECTION.UNDO;
  const mutationResults = [];
  for (const historyEntry of receipt.entries.toReversed()) {
    const mutationResult = applyJsonHistoryEntry(historyEntry, rollbackDirection);
    if (!mutationResult.success) {
      return {
        success: false,
        error: `回滚数据集变更失败：${mutationResult.error}`,
        mutationResults,
      };
    }
    mutationResults.push(mutationResult);
  }

  return { success: true, mutationResults };
}

export function applyJsonHistoryEntriesWithReceipt(historyEntries, direction) {
  if (!Array.isArray(historyEntries) || !isHistoryDirection(direction)) {
    return { success: false, error: 'JSON 历史跳转无效。', rollbackFailed: false };
  }
  if (historyEntries.length === 0) {
    return { success: true, changed: false, receipt: null, mutationResults: [] };
  }

  const appliedEntries = [];
  const mutationResults = [];
  for (const historyEntry of historyEntries) {
    for (const mutation of getHistoryStepMutations(historyEntry, direction)) {
      const mutationResult = applyJsonHistoryEntry(mutation, direction);
      if (!mutationResult.success) {
        const receipt = createDatasetMutationReceipt(appliedEntries, direction);
        const rollbackResult = receipt ? rollbackDatasetMutation(receipt) : { success: true };
        return {
          success: false,
          error: mutationResult.error,
          rollbackFailed: !rollbackResult.success,
        };
      }
      appliedEntries.push(mutation);
      mutationResults.push(mutationResult);
    }
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
      return '找不到对应的 JSON 标注项。';
    }
    const targetItem = datasetState.currentItems[activeQuadIndex];
    const preparedQuad = prepareDatasetQuad(selectedDots, coordinateScale, targetItem);
    if (!preparedQuad.success) return preparedQuad.error;
    targetItem[datasetState.productSchema.ItemKey] = serializePreparedQuad(preparedQuad.points);
    return KEYS.OPERATE_SUCCESS;
  }, '修改 JSON 标注项失败。');
}

function deleteJsonContent(activeQuadIndex) {
  return operateJsonContent(() => {
    if (activeQuadIndex < 0 || activeQuadIndex >= datasetState.currentItems.length) {
      return '找不到对应的 JSON 标注项。';
    }
    datasetState.currentItems.splice(activeQuadIndex, 1);
    return KEYS.OPERATE_SUCCESS;
  }, '删除 JSON 标注项失败。');
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
  }, '新增 JSON 标注项失败。');
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
    return { success: false, error: '当前 JSON 数据集中没有可用的图片数据。' };
  }
  if (!Number.isInteger(index) || index < 0 || index >= datasetState.dataset[ROOT_KEY].length) {
    return { success: false, error: 'JSON 图片序号无效。' };
  }

  return { success: true, index, path: datasetState.imagePaths[index] };
}

export function getJsonImageTarget(index) {
  return createJsonImageTarget(index);
}

export function getAdjacentJsonImageTarget(direction, baseIndex = datasetState.currentImageIndex) {
  if (!Array.isArray(datasetState.dataset[ROOT_KEY]) || datasetState.dataset[ROOT_KEY].length === 0) {
    return { success: false, error: '当前 JSON 数据集中没有可用的图片数据。' };
  }

  const totalImages = datasetState.dataset[ROOT_KEY].length;
  if (!Number.isInteger(baseIndex) || baseIndex < -1 || baseIndex >= totalImages) {
    return { success: false, error: 'JSON 图片序号无效。' };
  }
  if (direction === KEYS.NEXT) {
    return createJsonImageTarget((baseIndex + 1) % totalImages);
  }
  if (direction === KEYS.PREVIOUS) {
    const previousIndex = baseIndex < 0 ? totalImages - 1 : (baseIndex - 1 + totalImages) % totalImages;
    return createJsonImageTarget(previousIndex);
  }
  return { success: false, error: 'JSON 图片导航方向无效。' };
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

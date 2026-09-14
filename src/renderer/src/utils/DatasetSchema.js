export const DEFAULT_LOCATION = '0 0 0 0 0 0 0 0';

const ROOT_KEY = 'Picture';
const IMAGE_SOURCE_KEY = 'Image Source';
const NUMBER_KEY = 'No.';

export const PRODUCT_SCHEMAS = Object.freeze({
  DBR: Object.freeze({
    class: 'DBR',
    targetKey: 'Barcode Info',
    ItemKey: 'Barcode Location',
    ItemsCount: 'Barcode Count',
    auxiliaryFields: Object.freeze({
      'Barcode Hex': 'string',
      'Barcode Text': 'string',
      'Barcode Type': 'string',
    }),
  }),
  DDN: Object.freeze({
    class: 'DDN',
    targetKey: 'Quadrilateral Info',
    ItemKey: 'Expected Quadrilateral Points',
    ItemsCount: 'Expected Quadrilateral Count',
    auxiliaryFields: Object.freeze({}),
  }),
  DLR: Object.freeze({
    class: 'DLR',
    targetKey: 'Label Info',
    ItemKey: 'Label Location',
    ItemsCount: 'Label Count',
    auxiliaryFields: Object.freeze({
      'Label Text': 'array',
      'Label Hex': 'array',
    }),
  }),
});

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function cloneJsonValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function getDefaultValue(fieldType) {
  return fieldType === 'array' ? [] : '';
}

export function getProductSchema(productType) {
  if (typeof productType !== 'string') return null;
  return PRODUCT_SCHEMAS[productType.toUpperCase()] ?? null;
}

function getMainFields(schema) {
  return [schema.targetKey, schema.ItemsCount];
}

function getItemFields(schema) {
  return [schema.ItemKey, ...Object.keys(schema.auxiliaryFields)];
}

function datasetMatchesMainFields(pictures, schema) {
  const mainFields = getMainFields(schema);
  return pictures.some(picture => isObject(picture) && mainFields.some(fieldName => hasOwn(picture, fieldName)));
}

function datasetMatchesItemFields(pictures, schema) {
  const itemFields = getItemFields(schema);
  for (const picture of pictures) {
    if (!isObject(picture)) continue;

    for (const value of Object.values(picture)) {
      if (!Array.isArray(value)) continue;
      if (value.some(item => isObject(item) && itemFields.some(fieldName => hasOwn(item, fieldName)))) {
        return true;
      }
    }
  }
  return false;
}

export function detectProductType(pictures) {
  const schemas = Object.values(PRODUCT_SCHEMAS);
  const matchedMainProducts = schemas
    .filter(schema => datasetMatchesMainFields(pictures, schema))
    .map(schema => schema.class);

  if (matchedMainProducts.length > 1) {
    return {
      success: false,
      error: `数据集中包含相互冲突的产品字段：${matchedMainProducts.join('、')}。`,
    };
  }
  if (matchedMainProducts.length === 1) {
    return { success: true, productType: matchedMainProducts[0] };
  }

  const matchedItemProducts = schemas
    .filter(schema => datasetMatchesItemFields(pictures, schema))
    .map(schema => schema.class);

  if (matchedItemProducts.length > 1) {
    return {
      success: false,
      error: `数据集中包含相互冲突的产品字段：${matchedItemProducts.join('、')}。`,
    };
  }
  if (matchedItemProducts.length === 1) {
    return { success: true, productType: matchedItemProducts[0] };
  }

  return {
    success: false,
    error: '无法确定产品类型：未找到 DBR、DDN 或 DLR 的特征字段。',
  };
}

function normalizeLocation(value) {
  if (typeof value !== 'string') return { valid: false, value: DEFAULT_LOCATION };

  const tokens = value.trim().split(/\s+/);
  const valid =
    tokens.length === 8 && tokens.every(token => /^-?\d+$/.test(token) && Number.isSafeInteger(Number(token)));
  if (!valid) return { valid: false, value: DEFAULT_LOCATION };

  return { valid: true, value: tokens.map(token => String(Number(token))).join(' ') };
}

function parseCount(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== 'string') return null;

  const trimmedValue = value.trim();
  if (!/^\d+$/.test(trimmedValue)) return null;
  const parsedValue = Number(trimmedValue);
  return Number.isSafeInteger(parsedValue) ? parsedValue : null;
}

function createRepairStats() {
  return {
    removedPictures: 0,
    fieldsAdded: 0,
    arraysWrapped: 0,
    locationsReset: 0,
    locationsNormalized: 0,
    countsUpdated: 0,
    numbersUpdated: 0,
  };
}

function fail(error) {
  return { success: false, error };
}

function createLossyIssue(type, path, message) {
  return { type, path, message };
}

export function analyzeDataset(rawDataset) {
  if (!isObject(rawDataset)) {
    return fail('JSON 根节点必须是对象。');
  }
  if (!hasOwn(rawDataset, ROOT_KEY) || !Array.isArray(rawDataset[ROOT_KEY])) {
    return fail('必须存在 Picture 字段，且其值必须是数组。');
  }

  const productResult = detectProductType(rawDataset[ROOT_KEY]);
  if (!productResult.success) return productResult;

  const schema = getProductSchema(productResult.productType);
  const lossyIssues = [];

  for (let pictureIndex = 0; pictureIndex < rawDataset[ROOT_KEY].length; pictureIndex++) {
    const picture = rawDataset[ROOT_KEY][pictureIndex];
    const picturePath = `${ROOT_KEY}[${pictureIndex}]`;
    if (!isObject(picture)) {
      lossyIssues.push(createLossyIssue('remove-picture', picturePath, '该项不是对象，将被删除'));
      continue;
    }

    const imageSource = picture[IMAGE_SOURCE_KEY];
    if (typeof imageSource !== 'string' || imageSource.trim() === '') {
      lossyIssues.push(createLossyIssue('remove-picture', picturePath, `${IMAGE_SOURCE_KEY} 缺失或为空，该项将被删除`));
      continue;
    }

    if (hasOwn(picture, schema.targetKey) && !Array.isArray(picture[schema.targetKey])) {
      return fail(`${picturePath} 中的 ${schema.targetKey} 必须是数组。`);
    }

    const items = picture[schema.targetKey] ?? [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      if (!isObject(item)) {
        return fail(`${picturePath} 中的 ${schema.targetKey}[${itemIndex}] 必须是对象。`);
      }

      if (!normalizeLocation(item[schema.ItemKey]).valid) {
        lossyIssues.push(
          createLossyIssue(
            'reset-location',
            `${picturePath}.${schema.targetKey}[${itemIndex}].${schema.ItemKey}`,
            `无效或缺失的坐标将替换为 ${DEFAULT_LOCATION}`,
          ),
        );
      }
    }
  }

  return {
    success: true,
    productType: schema.class,
    lossyIssues,
    requiresLossyRepair: lossyIssues.length > 0,
  };
}

export function normalizeDataset(rawDataset, { allowLossyRepairs = false } = {}) {
  const analysis = analyzeDataset(rawDataset);
  if (!analysis.success) return analysis;

  if (analysis.requiresLossyRepair && !allowLossyRepairs) {
    return {
      ...analysis,
      changed: false,
      wouldChange: true,
      repairs: createRepairStats(),
    };
  }

  const schema = getProductSchema(analysis.productType);
  const dataset = cloneJsonValue(rawDataset);
  const repairs = createRepairStats();
  const pictures = [];

  for (let pictureIndex = 0; pictureIndex < dataset[ROOT_KEY].length; pictureIndex++) {
    const picture = dataset[ROOT_KEY][pictureIndex];
    if (!isObject(picture)) {
      repairs.removedPictures++;
      continue;
    }

    const imageSource = picture[IMAGE_SOURCE_KEY];
    if (typeof imageSource !== 'string' || imageSource.trim() === '') {
      repairs.removedPictures++;
      continue;
    }

    if (!hasOwn(picture, schema.targetKey)) {
      picture[schema.targetKey] = [];
      repairs.fieldsAdded++;
    } else if (!Array.isArray(picture[schema.targetKey])) {
      return fail(`Picture[${pictureIndex}] 中的 ${schema.targetKey} 必须是数组。`);
    }

    const items = picture[schema.targetKey];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      if (!isObject(item)) {
        return fail(`Picture[${pictureIndex}] 中的 ${schema.targetKey}[${itemIndex}] 必须是对象。`);
      }

      const locationResult = normalizeLocation(item[schema.ItemKey]);
      if (!locationResult.valid) {
        if (!hasOwn(item, schema.ItemKey)) repairs.fieldsAdded++;
        item[schema.ItemKey] = DEFAULT_LOCATION;
        repairs.locationsReset++;
      } else if (item[schema.ItemKey] !== locationResult.value) {
        item[schema.ItemKey] = locationResult.value;
        repairs.locationsNormalized++;
      }

      for (const [fieldName, fieldType] of Object.entries(schema.auxiliaryFields)) {
        if (!hasOwn(item, fieldName)) {
          item[fieldName] = getDefaultValue(fieldType);
          repairs.fieldsAdded++;
        } else if (fieldType === 'array' && !Array.isArray(item[fieldName])) {
          item[fieldName] = [item[fieldName]];
          repairs.arraysWrapped++;
        }
      }
    }

    const expectedCount = items.length;
    if (parseCount(picture[schema.ItemsCount]) !== expectedCount) {
      if (!hasOwn(picture, schema.ItemsCount)) repairs.fieldsAdded++;
      picture[schema.ItemsCount] = expectedCount;
      repairs.countsUpdated++;
    }

    pictures.push(picture);
  }

  for (let index = 0; index < pictures.length; index++) {
    const expectedNumber = String(index + 1);
    if (pictures[index][NUMBER_KEY] !== expectedNumber) {
      if (!hasOwn(pictures[index], NUMBER_KEY)) repairs.fieldsAdded++;
      pictures[index][NUMBER_KEY] = expectedNumber;
      repairs.numbersUpdated++;
    }
  }

  dataset[ROOT_KEY] = pictures;
  const changed = Object.values(repairs).some(value => value > 0);
  return {
    success: true,
    productType: schema.class,
    data: dataset,
    changed,
    repairs,
    lossyIssues: analysis.lossyIssues,
    requiresLossyRepair: false,
  };
}

export function formatLossyRepairSummary(lossyIssues, detailLimit = 8) {
  if (!Array.isArray(lossyIssues) || lossyIssues.length === 0) return '';

  const visibleIssues = lossyIssues.slice(0, detailLimit);
  const lines = visibleIssues.map(issue => `- ${issue.path}：${issue.message}。`);
  if (lossyIssues.length > visibleIssues.length) {
    lines.push(`- 另有 ${lossyIssues.length - visibleIssues.length} 项有损修复未列出。`);
  }
  return `数据集需要执行 ${lossyIssues.length} 项有损修复：\n${lines.join('\n')}`;
}

export function formatRepairSummary(repairs) {
  const parts = [];
  if (repairs.removedPictures) parts.push(`删除 ${repairs.removedPictures} 个无效图片项`);
  if (repairs.fieldsAdded) parts.push(`补充 ${repairs.fieldsAdded} 个缺失字段`);
  if (repairs.arraysWrapped) parts.push(`将 ${repairs.arraysWrapped} 个值转换为数组`);
  if (repairs.locationsReset) parts.push(`重置 ${repairs.locationsReset} 个无效坐标`);
  if (repairs.locationsNormalized) parts.push(`规范化 ${repairs.locationsNormalized} 个坐标`);
  if (repairs.countsUpdated) parts.push(`更新 ${repairs.countsUpdated} 个数量值`);
  if (repairs.numbersUpdated) parts.push(`重新编号 ${repairs.numbersUpdated} 个图片项`);
  return parts.length > 0 ? `JSON 已规范化：${parts.join('，')}。` : '';
}

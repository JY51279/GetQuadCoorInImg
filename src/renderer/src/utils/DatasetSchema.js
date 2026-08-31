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
  return pictures.some(
    picture => isObject(picture) && mainFields.some(fieldName => hasOwn(picture, fieldName)),
  );
}

function datasetMatchesItemFields(pictures, schema) {
  const itemFields = getItemFields(schema);
  for (const picture of pictures) {
    if (!isObject(picture)) continue;

    for (const value of Object.values(picture)) {
      if (!Array.isArray(value)) continue;
      if (
        value.some(
          item => isObject(item) && itemFields.some(fieldName => hasOwn(item, fieldName)),
        )
      ) {
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
      error: `Dataset contains conflicting product fields: ${matchedMainProducts.join(', ')}.`,
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
      error: `Dataset contains conflicting product fields: ${matchedItemProducts.join(', ')}.`,
    };
  }
  if (matchedItemProducts.length === 1) {
    return { success: true, productType: matchedItemProducts[0] };
  }

  return {
    success: false,
    error: 'Unable to determine the product type: no DBR, DDN, or DLR signature fields were found.',
  };
}

function normalizeLocation(value) {
  if (typeof value !== 'string') return { valid: false, value: DEFAULT_LOCATION };

  const tokens = value.trim().split(/\s+/);
  const valid =
    tokens.length === 8 &&
    tokens.every(token => /^-?\d+$/.test(token) && Number.isSafeInteger(Number(token)));
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

export function normalizeDataset(rawDataset) {
  if (!isObject(rawDataset)) {
    return fail('JSON root must be an object.');
  }
  if (!hasOwn(rawDataset, ROOT_KEY) || !Array.isArray(rawDataset[ROOT_KEY])) {
    return fail('Picture must exist and be an array.');
  }

  const productResult = detectProductType(rawDataset[ROOT_KEY]);
  if (!productResult.success) return productResult;

  const schema = getProductSchema(productResult.productType);
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
      return fail(`${schema.targetKey} must be an array at Picture[${pictureIndex}].`);
    }

    const items = picture[schema.targetKey];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      const item = items[itemIndex];
      if (!isObject(item)) {
        return fail(`${schema.targetKey}[${itemIndex}] must be an object at Picture[${pictureIndex}].`);
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
  };
}

export function formatRepairSummary(repairs) {
  const parts = [];
  if (repairs.removedPictures) parts.push(`removed ${repairs.removedPictures} invalid image item(s)`);
  if (repairs.fieldsAdded) parts.push(`added ${repairs.fieldsAdded} missing field(s)`);
  if (repairs.arraysWrapped) parts.push(`wrapped ${repairs.arraysWrapped} value(s) in arrays`);
  if (repairs.locationsReset) parts.push(`reset ${repairs.locationsReset} invalid location(s)`);
  if (repairs.locationsNormalized) parts.push(`normalized ${repairs.locationsNormalized} location(s)`);
  if (repairs.countsUpdated) parts.push(`updated ${repairs.countsUpdated} count value(s)`);
  if (repairs.numbersUpdated) parts.push(`renumbered ${repairs.numbersUpdated} image item(s)`);
  return parts.length > 0 ? `JSON normalized: ${parts.join(', ')}.` : '';
}

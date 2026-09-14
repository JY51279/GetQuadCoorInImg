import { PRODUCT_SCHEMAS } from '../../src/renderer/src/utils/DatasetSchema.js';

export function createPicture(productType, imageSource, location = '0 0 10 0 10 10 0 10') {
  const schema = PRODUCT_SCHEMAS[productType];
  const item = { [schema.ItemKey]: location };
  for (const [fieldName, fieldType] of Object.entries(schema.auxiliaryFields)) {
    item[fieldName] = fieldType === 'array' ? [] : '';
  }

  return {
    'Image Source': imageSource,
    'No.': '1',
    [schema.ItemsCount]: 1,
    [schema.targetKey]: [item],
  };
}

export function createDbrPicture(overrides = {}) {
  return {
    ...createPicture('DBR', 'images\\one.png'),
    ...overrides,
  };
}

export function createJsonResponse(pictures, overrides = {}) {
  return {
    success: true,
    jsonInfo: {
      str: JSON.stringify({ Picture: pictures }),
      path: 'C:\\datasets\\sample.json',
      fileName: 'sample.json',
      ...overrides,
    },
  };
}

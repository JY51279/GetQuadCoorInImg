import { PRODUCT_SCHEMAS } from '../../src/renderer/src/utils/DatasetSchema.js';
import { DATASET_FILE_STATUS } from '../../src/shared/DatasetFileResponse.js';

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
  const path = overrides.path ?? 'C:\\datasets\\sample.json';
  const fileName = overrides.fileName ?? 'sample.json';
  return {
    requestId: overrides.requestId ?? 1,
    status: DATASET_FILE_STATUS.READY,
    target: { path, fileName },
    jsonInfo: { str: overrides.str ?? JSON.stringify({ Picture: pictures }) },
    error: '',
  };
}

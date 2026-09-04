import { describe, expect, it } from 'vitest';
import { detectProductType, normalizeDataset, PRODUCT_SCHEMAS } from '../src/renderer/src/utils/DatasetSchema.js';
import {
  areImagePathsEquivalent,
  commitPreparedJsonProcess,
  createDatasetMutationSnapshot,
  getAdjacentJsonImageTarget,
  getCurrentJsonImageIndex,
  getJsonFileInfo,
  getJsonImageTarget,
  getJsonPerPicPointsArray,
  getJsonPicNum,
  prepareJsonProcess,
  resetPicJson,
  restoreDatasetMutationSnapshot,
  setQuadInfo,
  updateJson,
} from '../src/renderer/src/state/DatasetState.js';
import { KEYS, parsePointString2Array } from '../src/renderer/src/utils/BasicFuncs.js';

function createPicture(productType, imageSource, location = '0 0 10 0 10 10 0 10') {
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

function loadDbrDataset() {
  const data = {
    Picture: [createPicture('DBR', 'C:/images/one.png'), createPicture('DBR', 'C:/images/two.png')],
  };
  data.Picture[1]['No.'] = '2';

  const prepared = prepareJsonProcess({
    str: JSON.stringify(data),
    path: 'C:/datasets/sample.json',
  });
  expect(prepared.success).toBe(true);
  expect(commitPreparedJsonProcess(prepared)).toBe(true);
  expect(resetPicJson('C:/images/one.png', 0)).toBe(true);
}

describe('Dataset schema', () => {
  it.each(['DBR', 'DDN', 'DLR'])('detects the %s product schema', productType => {
    const result = detectProductType([createPicture(productType, 'image.png')]);
    expect(result).toEqual({ success: true, productType });
  });

  it('repairs invalid DBR fields without changing the input object', () => {
    const source = {
      Picture: [
        null,
        {
          'Image Source': 'image.png',
          'No.': '7',
          'Barcode Count': '9',
          'Barcode Info': [{ 'Barcode Location': 'invalid' }],
        },
      ],
    };

    const result = normalizeDataset(source);
    expect(result.success).toBe(true);
    expect(result.productType).toBe('DBR');
    expect(result.changed).toBe(true);
    expect(result.data.Picture).toHaveLength(1);
    expect(result.data.Picture[0]['No.']).toBe('1');
    expect(result.data.Picture[0]['Barcode Count']).toBe(1);
    expect(result.data.Picture[0]['Barcode Info'][0]).toEqual({
      'Barcode Location': '0 0 0 0 0 0 0 0',
      'Barcode Hex': '',
      'Barcode Text': '',
      'Barcode Type': '',
    });
    expect(source.Picture).toHaveLength(2);
    expect(source.Picture[1]['Barcode Info'][0]).toEqual({ 'Barcode Location': 'invalid' });
  });
});

describe('Dataset state operations', () => {
  it('matches Windows image paths without case sensitivity', () => {
    loadDbrDataset();

    expect(areImagePathsEquivalent('C:\\Images\\ONE.PNG', 'c:/images/one.png')).toBe(true);
    expect(areImagePathsEquivalent('/Images/one.png', '/images/one.png')).toBe(false);
    expect(resetPicJson('c:/IMAGES/ONE.PNG')).toBe(true);
    expect(getJsonPicNum()).toEqual({ picNum: 1, picTotalNum: 2 });
  });

  it('navigates images with wrapping and rejects invalid targets', () => {
    loadDbrDataset();

    expect(getJsonPicNum()).toEqual({ picNum: 1, picTotalNum: 2 });
    expect(getJsonImageTarget(1)).toEqual({ success: true, index: 1, path: 'C:/images/two.png' });
    expect(getCurrentJsonImageIndex()).toBe(0);
    expect(getAdjacentJsonImageTarget(KEYS.NEXT)).toEqual({
      success: true,
      index: 1,
      path: 'C:/images/two.png',
    });
    expect(getAdjacentJsonImageTarget(KEYS.PREVIOUS)).toEqual({
      success: true,
      index: 1,
      path: 'C:/images/two.png',
    });
    expect(getAdjacentJsonImageTarget(KEYS.NEXT, 1)).toEqual({
      success: true,
      index: 0,
      path: 'C:/images/one.png',
    });
    expect(getJsonImageTarget(2)).toEqual({ success: false, error: 'Invalid JSON image index.' });
  });

  it('starts a replacement dataset from its first image instead of the previous high index', () => {
    const oldData = {
      Picture: Array.from({ length: 198 }, (_, index) =>
        createPicture('DBR', `C:/old-images/${index + 1}.png`),
      ),
    };
    const oldPrepared = prepareJsonProcess({
      str: JSON.stringify(oldData),
      path: 'C:/datasets/old.json',
    });
    expect(commitPreparedJsonProcess(oldPrepared)).toBe(true);
    expect(resetPicJson('C:/old-images/198.png', 197)).toBe(true);
    expect(getJsonPicNum().picNum).toBe(198);

    const newData = {
      Picture: [createPicture('DBR', 'C:/new-images/one.png'), createPicture('DBR', 'C:/new-images/two.png')],
    };
    const newPrepared = prepareJsonProcess({
      str: JSON.stringify(newData),
      path: 'C:/datasets/new.json',
    });
    expect(commitPreparedJsonProcess(newPrepared)).toBe(true);
    expect(getCurrentJsonImageIndex()).toBe(-1);
    expect(getJsonPicNum()).toEqual({ picNum: 0, picTotalNum: 2 });

    const firstTarget = getAdjacentJsonImageTarget(KEYS.NEXT);
    expect(firstTarget).toEqual({ success: true, index: 0, path: 'C:/new-images/one.png' });
    expect(getCurrentJsonImageIndex()).toBe(-1);
    expect(resetPicJson(firstTarget.path, firstTarget.index)).toBe(true);
    expect(getJsonPicNum()).toEqual({ picNum: 1, picTotalNum: 2 });
  });

  it('modifies only the closest point when one point is selected', () => {
    loadDbrDataset();
    setQuadInfo([{ x: 9, y: 1 }]);

    expect(updateJson(KEYS.JSON_MODIFY, 1, 0)).toBe(KEYS.OPERATE_SUCCESS);
    const points = getJsonPerPicPointsArray()[0];
    expect(points).toContainEqual({ x: 9, y: 1 });
    expect(points).not.toContainEqual({ x: 10, y: 0 });
    expect(points).toEqual(
      expect.arrayContaining([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ]),
    );
  });

  it('accepts the same explicit quad index after switching images', () => {
    loadDbrDataset();
    setQuadInfo([{ x: 9, y: 1 }]);
    expect(updateJson(KEYS.JSON_MODIFY, 1, 0)).toBe(KEYS.OPERATE_SUCCESS);

    expect(resetPicJson('C:/images/two.png', 1)).toBe(true);
    setQuadInfo([{ x: 1, y: 9 }]);
    expect(updateJson(KEYS.JSON_MODIFY, 1, 0)).toBe(KEYS.OPERATE_SUCCESS);
    expect(getJsonPerPicPointsArray()[0]).toContainEqual({ x: 1, y: 9 });
  });

  it('adds and deletes annotations while keeping the item count synchronized', () => {
    loadDbrDataset();
    setQuadInfo([
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]);

    expect(updateJson(KEYS.JSON_ADD, 1)).toBe(KEYS.OPERATE_SUCCESS);
    let savedDataset = JSON.parse(getJsonFileInfo().str);
    expect(savedDataset.Picture[0]['Barcode Count']).toBe(2);
    expect(savedDataset.Picture[0]['Barcode Info'][1]['Barcode Location']).toBe('20 20 30 20 30 30 20 30');

    expect(updateJson(KEYS.JSON_DELETE, 1, 1)).toBe(KEYS.OPERATE_SUCCESS);
    savedDataset = JSON.parse(getJsonFileInfo().str);
    expect(savedDataset.Picture[0]['Barcode Count']).toBe(1);
    expect(savedDataset.Picture[0]['Barcode Info']).toHaveLength(1);
  });

  it('restores the data before a mutation when persistence fails', () => {
    loadDbrDataset();
    const snapshot = createDatasetMutationSnapshot();
    setQuadInfo([
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]);

    expect(updateJson(KEYS.JSON_ADD, 1)).toBe(KEYS.OPERATE_SUCCESS);
    expect(JSON.parse(getJsonFileInfo().str).Picture[0]['Barcode Count']).toBe(2);
    expect(restoreDatasetMutationSnapshot(snapshot)).toBe(true);

    const restoredDataset = JSON.parse(getJsonFileInfo().str);
    expect(restoredDataset.Picture[0]['Barcode Count']).toBe(1);
    expect(restoredDataset.Picture[0]['Barcode Info']).toHaveLength(1);
  });

  it('does not replace committed state when preparation fails', () => {
    loadDbrDataset();
    const before = getJsonFileInfo();
    const invalid = prepareJsonProcess({ str: '{"Picture":"invalid"}', path: 'C:/datasets/invalid.json' });

    expect(invalid.success).toBe(false);
    expect(commitPreparedJsonProcess(invalid)).toBe(false);
    expect(getJsonFileInfo()).toEqual(before);
    expect(parsePointString2Array('1 2 3 4', ' ')).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });
});

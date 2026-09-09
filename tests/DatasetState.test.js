import { describe, expect, it } from 'vitest';
import {
  analyzeDataset,
  detectProductType,
  normalizeDataset,
  PRODUCT_SCHEMAS,
} from '../src/renderer/src/utils/DatasetSchema.js';
import {
  areImagePathsEquivalent,
  applyJsonHistoryEntry,
  commitPreparedJsonProcess,
  createDatasetMutationSnapshot,
  getAdjacentJsonImageTarget,
  getCurrentAnnotationView,
  getCurrentJsonImageIndex,
  getJsonFileInfo,
  getJsonImageTarget,
  getJsonImagePosition,
  prepareJsonProcess,
  resetPicJson,
  restoreDatasetMutationSnapshot,
  updateJson,
  updateJsonWithHistory,
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
  expect(resetPicJson('C:/images/one.png', 0).success).toBe(true);
}

describe('Dataset schema', () => {
  it.each(['DBR', 'DDN', 'DLR'])('detects the %s product schema', productType => {
    const result = detectProductType([createPicture(productType, 'image.png')]);
    expect(result).toEqual({ success: true, productType });
  });

  it('reports lossy DBR repairs before applying them and does not change the input object', () => {
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

    const analysis = analyzeDataset(source);
    expect(analysis.success).toBe(true);
    expect(analysis.requiresLossyRepair).toBe(true);
    expect(analysis.lossyIssues).toEqual([
      expect.objectContaining({ type: 'remove-picture', path: 'Picture[0]' }),
      expect.objectContaining({
        type: 'reset-location',
        path: 'Picture[1].Barcode Info[0].Barcode Location',
      }),
    ]);

    const pendingResult = normalizeDataset(source);
    expect(pendingResult.success).toBe(true);
    expect(pendingResult.requiresLossyRepair).toBe(true);
    expect(pendingResult.data).toBeUndefined();
    expect(source.Picture).toHaveLength(2);
    expect(source.Picture[1]['Barcode Info'][0]).toEqual({ 'Barcode Location': 'invalid' });

    const result = normalizeDataset(source, { allowLossyRepairs: true });
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

  it('applies non-lossy normalization without asking for lossy repair approval', () => {
    const source = {
      Picture: [
        {
          'Image Source': 'image.png',
          'No.': '9',
          'Barcode Count': '7',
          'Barcode Info': [{ 'Barcode Location': '0 0 10 0 10 10 0 10' }],
        },
      ],
    };

    const result = normalizeDataset(source);
    expect(result.success).toBe(true);
    expect(result.requiresLossyRepair).toBe(false);
    expect(result.changed).toBe(true);
    expect(result.data.Picture[0]).toMatchObject({
      'No.': '1',
      'Barcode Count': 1,
    });
    expect(result.data.Picture[0]['Barcode Info'][0]).toMatchObject({
      'Barcode Hex': '',
      'Barcode Text': '',
      'Barcode Type': '',
    });
  });
});

describe('Dataset state operations', () => {
  it('matches Windows image paths without case sensitivity', () => {
    loadDbrDataset();

    expect(areImagePathsEquivalent('C:\\Images\\ONE.PNG', 'c:/images/one.png')).toBe(true);
    expect(areImagePathsEquivalent('/Images/one.png', '/images/one.png')).toBe(false);
    expect(resetPicJson('c:/IMAGES/ONE.PNG').success).toBe(true);
    expect(getJsonImagePosition()).toEqual({ currentIndex: 0, total: 2 });
  });

  it('returns a structured failure when an image has no matching dataset item', () => {
    loadDbrDataset();

    expect(resetPicJson('C:/images/missing.png')).toEqual({
      success: false,
      error: 'No JSON data found for image path:\nC:/images/missing.png',
    });
    expect(getCurrentJsonImageIndex()).toBe(-1);
  });

  it('returns a detached annotation view for the current image', () => {
    loadDbrDataset();

    const annotationView = getCurrentAnnotationView();
    expect(annotationView.formattedItems).toHaveLength(1);
    expect(annotationView.quads).toHaveLength(1);

    annotationView.quads[0][0].x = 999;
    expect(getCurrentAnnotationView().quads[0][0].x).toBe(0);
  });

  it('navigates images with wrapping and rejects invalid targets', () => {
    loadDbrDataset();

    expect(getJsonImagePosition()).toEqual({ currentIndex: 0, total: 2 });
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
      Picture: Array.from({ length: 198 }, (_, index) => createPicture('DBR', `C:/old-images/${index + 1}.png`)),
    };
    const oldPrepared = prepareJsonProcess({
      str: JSON.stringify(oldData),
      path: 'C:/datasets/old.json',
    });
    expect(commitPreparedJsonProcess(oldPrepared)).toBe(true);
    expect(resetPicJson('C:/old-images/198.png', 197).success).toBe(true);
    expect(getJsonImagePosition().currentIndex).toBe(197);

    const newData = {
      Picture: [createPicture('DBR', 'C:/new-images/one.png'), createPicture('DBR', 'C:/new-images/two.png')],
    };
    const newPrepared = prepareJsonProcess({
      str: JSON.stringify(newData),
      path: 'C:/datasets/new.json',
    });
    expect(commitPreparedJsonProcess(newPrepared)).toBe(true);
    expect(getCurrentJsonImageIndex()).toBe(-1);
    expect(getJsonImagePosition()).toEqual({ currentIndex: -1, total: 2 });

    const firstTarget = getAdjacentJsonImageTarget(KEYS.NEXT);
    expect(firstTarget).toEqual({ success: true, index: 0, path: 'C:/new-images/one.png' });
    expect(getCurrentJsonImageIndex()).toBe(-1);
    expect(resetPicJson(firstTarget.path, firstTarget.index).success).toBe(true);
    expect(getJsonImagePosition()).toEqual({ currentIndex: 0, total: 2 });
  });

  it('modifies only the closest point when one point is selected', () => {
    loadDbrDataset();

    expect(updateJson(KEYS.JSON_MODIFY, 1, 0, [{ x: 9, y: 1 }])).toBe(KEYS.OPERATE_SUCCESS);
    const points = getCurrentAnnotationView().quads[0];
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

  it('maps displayed points back with independent horizontal and vertical scales', () => {
    loadDbrDataset();

    expect(updateJson(KEYS.JSON_MODIFY, { x: 0.5, y: 0.25 }, 0, [{ x: 5, y: 2 }])).toBe(KEYS.OPERATE_SUCCESS);

    expect(getCurrentAnnotationView().quads[0]).toContainEqual({ x: 10, y: 8 });
  });

  it('accepts the same explicit quad index after switching images', () => {
    loadDbrDataset();
    expect(updateJson(KEYS.JSON_MODIFY, 1, 0, [{ x: 9, y: 1 }])).toBe(KEYS.OPERATE_SUCCESS);

    expect(resetPicJson('C:/images/two.png', 1).success).toBe(true);
    expect(updateJson(KEYS.JSON_MODIFY, 1, 0, [{ x: 1, y: 9 }])).toBe(KEYS.OPERATE_SUCCESS);
    expect(getCurrentAnnotationView().quads[0]).toContainEqual({ x: 1, y: 9 });
  });

  it('adds and deletes annotations while keeping the item count synchronized', () => {
    loadDbrDataset();

    expect(
      updateJson(KEYS.JSON_ADD, 1, -1, [
        { x: 20, y: 20 },
        { x: 30, y: 30 },
      ]),
    ).toBe(KEYS.OPERATE_SUCCESS);
    let savedDataset = JSON.parse(getJsonFileInfo().str);
    expect(savedDataset.Picture[0]['Barcode Count']).toBe(2);
    expect(savedDataset.Picture[0]['Barcode Info'][1]['Barcode Location']).toBe('20 20 30 20 30 30 20 30');

    expect(updateJson(KEYS.JSON_DELETE, 1, 1)).toBe(KEYS.OPERATE_SUCCESS);
    savedDataset = JSON.parse(getJsonFileInfo().str);
    expect(savedDataset.Picture[0]['Barcode Count']).toBe(1);
    expect(savedDataset.Picture[0]['Barcode Info']).toHaveLength(1);
  });

  it('creates compact history entries for modifying annotations and applies undo and redo', () => {
    loadDbrDataset();

    const updateResult = updateJsonWithHistory(KEYS.JSON_MODIFY, 1, 0, [{ x: 9, y: 1 }]);
    expect(updateResult.success).toBe(true);
    expect(updateResult.historyEntry).toMatchObject({
      action: KEYS.JSON_MODIFY,
      imageIndex: 0,
      itemIndex: 0,
    });
    expect(getCurrentAnnotationView().quads[0]).toContainEqual({ x: 9, y: 1 });

    expect(applyJsonHistoryEntry(updateResult.historyEntry, 'undo')).toMatchObject({
      success: true,
      mutationType: 'replace',
      activeQuadIndex: 0,
    });
    expect(getCurrentAnnotationView().quads[0]).toContainEqual({ x: 10, y: 0 });

    expect(applyJsonHistoryEntry(updateResult.historyEntry, 'redo')).toMatchObject({
      success: true,
      mutationType: 'replace',
      activeQuadIndex: 0,
    });
    expect(getCurrentAnnotationView().quads[0]).toContainEqual({ x: 9, y: 1 });
  });

  it('undoes and redoes annotation insertion and deletion while synchronizing counts', () => {
    loadDbrDataset();

    const addResult = updateJsonWithHistory(KEYS.JSON_ADD, 1, -1, [
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]);
    expect(addResult.success).toBe(true);
    expect(addResult.historyEntry.beforeItem).toBeNull();
    expect(JSON.parse(getJsonFileInfo().str).Picture[0]['Barcode Count']).toBe(2);

    expect(applyJsonHistoryEntry(addResult.historyEntry, 'undo')).toMatchObject({
      success: true,
      mutationType: 'delete',
    });
    expect(JSON.parse(getJsonFileInfo().str).Picture[0]['Barcode Count']).toBe(1);
    expect(applyJsonHistoryEntry(addResult.historyEntry, 'redo')).toMatchObject({
      success: true,
      mutationType: 'insert',
    });
    expect(JSON.parse(getJsonFileInfo().str).Picture[0]['Barcode Count']).toBe(2);

    const deleteResult = updateJsonWithHistory(KEYS.JSON_DELETE, 1, 0);
    expect(deleteResult.success).toBe(true);
    expect(deleteResult.historyEntry.afterItem).toBeNull();
    expect(applyJsonHistoryEntry(deleteResult.historyEntry, 'undo')).toMatchObject({
      success: true,
      mutationType: 'insert',
      activeQuadIndex: 0,
    });
    expect(JSON.parse(getJsonFileInfo().str).Picture[0]['Barcode Count']).toBe(2);
    expect(applyJsonHistoryEntry(deleteResult.historyEntry, 'redo')).toMatchObject({
      success: true,
      mutationType: 'delete',
    });
    expect(JSON.parse(getJsonFileInfo().str).Picture[0]['Barcode Count']).toBe(1);
  });

  it('restores the data before a mutation when persistence fails', () => {
    loadDbrDataset();
    const snapshot = createDatasetMutationSnapshot();

    expect(
      updateJson(KEYS.JSON_ADD, 1, -1, [
        { x: 20, y: 20 },
        { x: 30, y: 30 },
      ]),
    ).toBe(KEYS.OPERATE_SUCCESS);
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

  it('requires explicit approval before preparing a dataset with lossy repairs', () => {
    const data = {
      Picture: [
        {
          'Image Source': 'C:/images/one.png',
          'Barcode Count': 1,
          'Barcode Info': [{ 'Barcode Location': 'invalid' }],
        },
      ],
    };
    const jsonData = { str: JSON.stringify(data), path: 'C:/datasets/lossy.json' };

    const pending = prepareJsonProcess(jsonData);
    expect(pending.success).toBe(true);
    expect(pending.requiresLossyRepair).toBe(true);
    expect(pending.lossyRepairSummary).toContain('Picture[0].Barcode Info[0].Barcode Location');
    expect(pending.fileInfo).toBeUndefined();
    expect(commitPreparedJsonProcess(pending)).toBe(false);

    const approved = prepareJsonProcess(jsonData, { allowLossyRepairs: true });
    expect(approved.success).toBe(true);
    expect(approved.requiresLossyRepair).toBe(false);
    expect(approved.lossyRepairsApplied).toBe(true);
    expect(JSON.parse(approved.fileInfo.str).Picture[0]['Barcode Info'][0]['Barcode Location']).toBe('0 0 0 0 0 0 0 0');
  });
});

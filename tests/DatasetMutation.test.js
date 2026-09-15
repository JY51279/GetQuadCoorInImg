import { describe, expect, it } from 'vitest';
import {
  applyJsonHistoryEntriesWithReceipt,
  applyJsonHistoryEntry,
  commitPreparedJsonProcess,
  copyPreviousQuadLocationWithHistory,
  getCurrentAnnotationView,
  getJsonFileInfo,
  prepareJsonProcess,
  resetPicJson,
  replaceQuadLocationWithHistory,
  rollbackDatasetMutation,
  updateJson,
  updateJsonWithHistory,
  updateQuadPointWithHistory,
} from '../src/renderer/src/state/DatasetState.js';
import { KEYS } from '../src/renderer/src/utils/BasicFuncs.js';
import { PRODUCT_SCHEMAS } from '../src/renderer/src/utils/DatasetSchema.js';
import { createPicture } from './fixtures/DatasetFixtures.js';

function loadDbrDataset(location = '0 0 10 0 10 10 0 10', barcodeType = '') {
  loadProductDataset('DBR', location, barcodeType);
}

function loadProductDataset(productType, location = '0 0 10 0 10 10 0 10', barcodeType = '', nextLocation = location) {
  const data = {
    Picture: [
      createPicture(productType, 'C:/images/one.png', location),
      createPicture(productType, 'C:/images/two.png', nextLocation),
    ],
  };
  if (productType === 'DBR') {
    data.Picture[0]['Barcode Info'][0]['Barcode Type'] = barcodeType;
    data.Picture[1]['Barcode Info'][0]['Barcode Type'] = barcodeType;
  }
  data.Picture[1]['No.'] = '2';

  const prepared = prepareJsonProcess({
    str: JSON.stringify(data),
    path: 'C:/datasets/sample.json',
  });
  expect(prepared.success).toBe(true);
  expect(commitPreparedJsonProcess(prepared)).toBe(true);
  expect(resetPicJson('C:/images/one.png', 0).success).toBe(true);
}

describe('Dataset mutations', () => {
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

  it('rejects a non-invertible coordinate scale without changing data or history', () => {
    loadDbrDataset();
    const before = getJsonFileInfo().str;

    const result = updateJsonWithHistory(KEYS.JSON_MODIFY, { x: 0, y: 0.5 }, 0, [{ x: 5, y: 2 }]);

    expect(result).toEqual({
      success: false,
      error: '无法将所选点换算为有效的数据集坐标。',
    });
    expect(result.historyEntry).toBeUndefined();
    expect(getJsonFileInfo().str).toBe(before);
  });

  it('updates an explicit dragged vertex and recalculates the canonical point indices', () => {
    loadDbrDataset('10 10 20 10 20 20 10 20');

    const result = updateQuadPointWithHistory(0, 1, { x: 5, y: 10 });

    expect(result.success).toBe(true);
    expect(result.historyEntry).toMatchObject({
      action: KEYS.JSON_MODIFY,
      imageIndex: 0,
      itemIndex: 0,
    });
    expect(JSON.parse(getJsonFileInfo().str).Picture[0]['Barcode Info'][0]['Barcode Location']).toBe(
      '5 10 10 10 20 20 10 20',
    );

    expect(applyJsonHistoryEntry(result.historyEntry, 'undo').success).toBe(true);
    expect(JSON.parse(getJsonFileInfo().str).Picture[0]['Barcode Info'][0]['Barcode Location']).toBe(
      '10 10 20 10 20 20 10 20',
    );
  });

  it('keeps the DataMatrix zero-index point fixed when a dragged vertex is reordered', () => {
    loadDbrDataset('10 10 20 10 20 20 10 20', 'datamatrix');

    const result = updateQuadPointWithHistory(0, 1, { x: 5, y: 10 });

    expect(result.success).toBe(true);
    const points = getCurrentAnnotationView().quads[0];
    expect(points[0]).toEqual({ x: 10, y: 10 });
    expect(points).toEqual(
      expect.arrayContaining([
        { x: 5, y: 10 },
        { x: 20, y: 20 },
        { x: 10, y: 20 },
      ]),
    );
  });

  it.each(['DBR', 'DDN', 'DLR'])('copies only the previous image location for %s and supports undo', productType => {
    const previousLocation = '5 5 15 5 15 15 5 15';
    const currentLocation = '20 20 30 20 30 30 20 30';
    loadProductDataset(productType, previousLocation, '', currentLocation);
    expect(resetPicJson('C:/images/two.png', 1).success).toBe(true);
    const schema = PRODUCT_SCHEMAS[productType];
    const beforeItem = JSON.parse(getJsonFileInfo().str).Picture[1][schema.targetKey][0];

    const result = copyPreviousQuadLocationWithHistory(0, { width: 100, height: 100 });

    expect(result).toMatchObject({
      success: true,
      changed: true,
      historyEntry: {
        action: KEYS.JSON_COPY_PREVIOUS_LOCATION,
        imageIndex: 1,
        itemIndex: 0,
      },
    });
    const copiedItem = JSON.parse(getJsonFileInfo().str).Picture[1][schema.targetKey][0];
    expect(copiedItem[schema.ItemKey]).toBe(previousLocation);
    expect({ ...copiedItem, [schema.ItemKey]: beforeItem[schema.ItemKey] }).toEqual(beforeItem);

    expect(applyJsonHistoryEntry(result.historyEntry, 'undo').success).toBe(true);
    expect(JSON.parse(getJsonFileInfo().str).Picture[1][schema.targetKey][0][schema.ItemKey]).toBe(currentLocation);
  });

  it('reports a no-op when the previous and current Quad locations are equal', () => {
    loadDbrDataset();
    expect(resetPicJson('C:/images/two.png', 1).success).toBe(true);

    const result = copyPreviousQuadLocationWithHistory(0, { width: 100, height: 100 });

    expect(result).toMatchObject({ success: true, changed: false, historyEntry: null, receipt: null });
  });

  it('normalizes the previous Loc with the shared Quad modification rules', () => {
    const previousLocation = '15 15 5 15 5 5 15 5';
    loadProductDataset('DBR', previousLocation, '', '20 20 30 20 30 30 20 30');
    expect(resetPicJson('C:/images/two.png', 1).success).toBe(true);

    const result = copyPreviousQuadLocationWithHistory(0, { width: 100, height: 100 });

    expect(result.success).toBe(true);
    expect(JSON.parse(getJsonFileInfo().str).Picture[1]['Barcode Info'][0]['Barcode Location']).toBe(
      '5 5 15 5 15 15 5 15',
    );
  });

  it('rejects copying without a previous image or a matching Quad index', () => {
    loadDbrDataset();
    expect(copyPreviousQuadLocationWithHistory(0, { width: 100, height: 100 })).toEqual({
      success: false,
      error: '当前图片没有上一张图片可供沿用坐标。',
    });

    expect(resetPicJson('C:/images/two.png', 1).success).toBe(true);
    expect(
      updateJsonWithHistory(KEYS.JSON_ADD, 1, -1, [
        { x: 20, y: 20 },
        { x: 30, y: 30 },
      ]).success,
    ).toBe(true);
    expect(copyPreviousQuadLocationWithHistory(1, { width: 100, height: 100 })).toEqual({
      success: false,
      error: '上一张图片中没有同下标的 Quad。',
    });
  });

  it('rejects previous locations outside the current image without changing data', () => {
    loadProductDataset('DBR', '90 90 110 90 110 110 90 110', '', '20 20 30 20 30 30 20 30');
    expect(resetPicJson('C:/images/two.png', 1).success).toBe(true);
    const before = getJsonFileInfo().str;

    const result = copyPreviousQuadLocationWithHistory(0, { width: 100, height: 100 });

    expect(result).toEqual({ success: false, error: 'Quad 坐标超出当前图片边界。' });
    expect(getJsonFileInfo().str).toBe(before);
  });

  it('uses the shared full-location mutation path for validated replacements', () => {
    loadDbrDataset('10 10 20 10 20 20 10 20');

    const result = replaceQuadLocationWithHistory(
      0,
      [
        { x: 15, y: 15 },
        { x: 25, y: 15 },
        { x: 25, y: 25 },
        { x: 15, y: 25 },
      ],
      { width: 100, height: 100 },
    );

    expect(result).toMatchObject({ success: true, changed: true });
    expect(JSON.parse(getJsonFileInfo().str).Picture[0]['Barcode Info'][0]['Barcode Location']).toBe(
      '15 15 25 15 25 25 15 25',
    );
  });

  it('preserves every untouched dataset coordinate during a direct point update', () => {
    loadDbrDataset('1 1 101 1 101 101 1 101');

    const result = updateQuadPointWithHistory(0, 1, { x: 80, y: 1 });

    expect(result.success).toBe(true);
    expect(JSON.parse(getJsonFileInfo().str).Picture[0]['Barcode Info'][0]['Barcode Location']).toBe(
      '1 1 80 1 101 101 1 101',
    );
  });

  it('rejects an invalid dragged Quad without changing the dataset', () => {
    loadDbrDataset();
    const before = getJsonFileInfo().str;

    const result = updateQuadPointWithHistory(0, 1, { x: 0, y: 0 });

    expect(result).toMatchObject({ success: false, error: 'Quad 必须包含四个不同的点。' });
    expect(getJsonFileInfo().str).toBe(before);

    const concaveResult = updateQuadPointWithHistory(0, 1, { x: 3, y: 7 });
    expect(concaveResult).toMatchObject({
      success: false,
      error: 'Quad 必须保持凸四边形，且边不能交叉。',
    });
    expect(getJsonFileInfo().str).toBe(before);
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

  it.each(['DBR', 'DDN', 'DLR'])('uses the same validated Quad preparation for %s annotations', productType => {
    loadProductDataset(productType);
    const schema = PRODUCT_SCHEMAS[productType];

    const result = updateJsonWithHistory(KEYS.JSON_ADD, 1, -1, [
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]);

    expect(result.success).toBe(true);
    expect(result.historyEntry).not.toBeNull();
    const picture = JSON.parse(getJsonFileInfo().str).Picture[0];
    expect(picture[schema.ItemsCount]).toBe(2);
    expect(picture[schema.targetKey][1][schema.ItemKey]).toBe('20 20 30 20 30 30 20 30');
  });

  it('preserves zero-point placeholder creation but rejects a one-point add without changing data or history', () => {
    loadDbrDataset();

    const placeholderResult = updateJsonWithHistory(KEYS.JSON_ADD, 1, -1, []);
    expect(placeholderResult.success).toBe(true);
    expect(placeholderResult.historyEntry.afterItem['Barcode Location']).toBe('0 0 0 0 0 0 0 0');

    const beforeInvalidAdd = getJsonFileInfo().str;
    const invalidResult = updateJsonWithHistory(KEYS.JSON_ADD, 1, -1, [{ x: 20, y: 20 }]);
    expect(invalidResult).toEqual({
      success: false,
      error: '创建 Quad 至少需要选择两个点。',
    });
    expect(invalidResult.historyEntry).toBeUndefined();
    expect(getJsonFileInfo().str).toBe(beforeInvalidAdd);
  });

  it('rejects invalid completed or explicit Quads without changing the dataset', () => {
    loadDbrDataset();
    const before = getJsonFileInfo().str;

    const degenerateRectangle = updateJsonWithHistory(KEYS.JSON_ADD, 1, -1, [
      { x: 20, y: 20 },
      { x: 20, y: 30 },
    ]);
    expect(degenerateRectangle).toMatchObject({
      success: false,
      error: 'Quad 必须包含四个不同的点。',
    });

    const concaveModify = updateJsonWithHistory(KEYS.JSON_MODIFY, 1, 0, [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 3, y: 3 },
      { x: 0, y: 10 },
    ]);
    expect(concaveModify).toMatchObject({
      success: false,
      error: 'Quad 必须保持凸四边形，且边不能交叉。',
    });

    expect(degenerateRectangle.historyEntry).toBeUndefined();
    expect(concaveModify.historyEntry).toBeUndefined();
    expect(getJsonFileInfo().str).toBe(before);
  });

  it('validates three-point completion and keeps the DataMatrix first selected point fixed', () => {
    loadDbrDataset('0 0 10 0 10 10 0 10', 'datamatrix');

    const result = updateJsonWithHistory(KEYS.JSON_MODIFY, 1, 0, [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 22, y: 18 },
    ]);

    expect(result.success).toBe(true);
    const points = getCurrentAnnotationView().quads[0];
    expect(points[0]).toEqual({ x: 10, y: 10 });
    expect(points).toEqual([
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 22, y: 18 },
      { x: 12, y: 18 },
    ]);
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

  it('reports a successful no-op without creating a receipt', () => {
    loadDbrDataset();
    const before = getJsonFileInfo().str;

    const updateResult = updateJsonWithHistory(KEYS.JSON_MODIFY, 1, 0, [{ x: 0, y: 0 }]);

    expect(updateResult).toMatchObject({
      success: true,
      changed: false,
      historyEntry: null,
      receipt: null,
    });
    expect(getJsonFileInfo().str).toBe(before);
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

  it('applies multiple history entries in the required order for direct timeline jumps', () => {
    loadDbrDataset();

    const addEntry = updateJsonWithHistory(KEYS.JSON_ADD, 1, -1, [
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]).historyEntry;
    const modifyEntry = updateJsonWithHistory(KEYS.JSON_MODIFY, 1, 0, [{ x: 9, y: 1 }]).historyEntry;

    const transitionResult = applyJsonHistoryEntriesWithReceipt([modifyEntry, addEntry], 'undo');
    expect(transitionResult).toMatchObject({ success: true, changed: true });
    expect(transitionResult.mutationResults).toHaveLength(2);
    expect(getCurrentAnnotationView().quads).toHaveLength(1);
    expect(getCurrentAnnotationView().quads[0]).toContainEqual({ x: 10, y: 0 });

    expect(rollbackDatasetMutation(transitionResult.receipt).success).toBe(true);
    expect(getCurrentAnnotationView().quads).toHaveLength(2);
    expect(getCurrentAnnotationView().quads[0]).toContainEqual({ x: 9, y: 1 });
  });

  it('rolls back a compact mutation receipt when persistence fails', () => {
    loadDbrDataset();
    const mutationResult = updateJsonWithHistory(KEYS.JSON_ADD, 1, -1, [
      { x: 20, y: 20 },
      { x: 30, y: 30 },
    ]);

    expect(mutationResult).toMatchObject({ success: true, changed: true });
    expect(JSON.parse(getJsonFileInfo().str).Picture[0]['Barcode Count']).toBe(2);
    expect(rollbackDatasetMutation(mutationResult.receipt).success).toBe(true);

    const restoredDataset = JSON.parse(getJsonFileInfo().str);
    expect(restoredDataset.Picture[0]['Barcode Count']).toBe(1);
    expect(restoredDataset.Picture[0]['Barcode Info']).toHaveLength(1);
  });

  it('restores completed history steps when a multi-entry transition fails partway through', () => {
    loadDbrDataset();
    const modifyEntry = updateJsonWithHistory(KEYS.JSON_MODIFY, 1, 0, [{ x: 9, y: 1 }]).historyEntry;
    const changedDataset = getJsonFileInfo().str;
    const invalidEntry = { ...modifyEntry, itemIndex: 99 };

    const transitionResult = applyJsonHistoryEntriesWithReceipt([modifyEntry, invalidEntry], 'undo');

    expect(transitionResult).toMatchObject({ success: false, rollbackFailed: false });
    expect(getJsonFileInfo().str).toBe(changedDataset);
  });
});

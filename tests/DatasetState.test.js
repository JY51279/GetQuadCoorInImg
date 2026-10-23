import { prepareJsonProcess } from '../src/renderer/src/utils/DatasetPreparation.js';
import { describe, expect, it } from 'vitest';
import {
  areImagePathsEquivalent,
  clearDatasetProcess,
  commitPreparedJsonProcess,
  getAdjacentJsonImageTarget,
  getCurrentAnnotationView,
  getCurrentImageQuadSnapshot,
  getCurrentJsonImageIndex,
  getJsonFileInfo,
  getJsonImagePosition,
  getJsonImageTarget,
  getJsonImageTargetByPath,
  resetPicJson,
} from '../src/renderer/src/state/DatasetState.js';
import { KEYS } from '../src/renderer/src/utils/BasicFuncs.js';
import { createPicture } from './fixtures/DatasetFixtures.js';

function loadDbrDataset() {
  const data = {
    Picture: [createPicture('DBR', 'C:/images/one.png'), { ...createPicture('DBR', 'C:/images/two.png'), 'No.': '2' }],
  };
  const prepared = prepareJsonProcess({
    str: JSON.stringify(data),
    path: 'C:/datasets/sample.json',
  });
  expect(prepared.success).toBe(true);
  expect(commitPreparedJsonProcess(prepared)).toBe(true);
  expect(resetPicJson('C:/images/one.png', 0).success).toBe(true);
}

describe('Dataset state operations', () => {
  it('owns committed data independently of the preparation result', () => {
    const prepared = prepareJsonProcess({
      str: JSON.stringify({ Picture: [createPicture('DBR', 'C:/images/one.png')] }),
      path: 'C:/datasets/sample.json',
    });
    expect(commitPreparedJsonProcess(prepared)).toBe(true);
    prepared.data.Picture[0]['Barcode Info'][0]['Barcode Location'] = 'invalid';
    prepared.imagePaths[0] = 'C:/wrong.png';
    expect(resetPicJson('C:/images/one.png', 0).success).toBe(true);
    expect(getCurrentAnnotationView().quads[0][0]).toEqual({ x: 0, y: 0 });
  });

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
      error: '找不到与以下图片路径匹配的 JSON 数据：\nC:/images/missing.png',
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

  it('creates a complete detached Quad snapshot and reports placeholders', () => {
    const placeholderData = {
      Picture: [createPicture('DBR', 'C:/images/placeholder.png')],
    };
    placeholderData.Picture[0]['Barcode Info'][0]['Barcode Location'] = '0 0 0 0 0 0 0 0';
    const placeholderPrepared = prepareJsonProcess({
      str: JSON.stringify(placeholderData),
      path: 'C:/datasets/placeholder.json',
    });
    expect(commitPreparedJsonProcess(placeholderPrepared)).toBe(true);
    expect(resetPicJson('C:/images/placeholder.png', 0).success).toBe(true);
    expect(getCurrentImageQuadSnapshot()).toEqual({
      success: false,
      error: '区域 1 仍是占位坐标，请先完成该码区标注。',
    });

    const data = {
      Picture: [createPicture('DBR', 'C:/images/valid.png')],
    };
    data.Picture[0]['Barcode Info'][0]['Barcode Location'] = '10 10 30 10 30 30 10 30';
    const prepared = prepareJsonProcess({
      str: JSON.stringify(data),
      path: 'C:/datasets/valid.json',
    });
    expect(commitPreparedJsonProcess(prepared)).toBe(true);
    expect(resetPicJson('C:/images/valid.png', 0).success).toBe(true);

    const snapshot = getCurrentImageQuadSnapshot();
    expect(snapshot).toEqual({
      success: true,
      imageIndex: 0,
      quads: [
        {
          regionIndex: 0,
          points: [
            { x: 10, y: 10 },
            { x: 30, y: 10 },
            { x: 30, y: 30 },
            { x: 10, y: 30 },
          ],
        },
      ],
    });
    snapshot.quads[0].points[0].x = 999;
    expect(getCurrentImageQuadSnapshot().quads[0].points[0].x).toBe(10);
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
    expect(getJsonImageTarget(2)).toEqual({ success: false, error: 'JSON 图片序号无效。' });
  });

  it('restores an image by path when its saved index has changed', () => {
    loadDbrDataset();

    expect(getJsonImageTargetByPath('c:/IMAGES/TWO.PNG', 0)).toEqual({
      success: true,
      index: 1,
      path: 'C:/images/two.png',
    });
    expect(getJsonImageTargetByPath('C:/images/missing.png', 1)).toEqual({
      success: false,
      error: 'JSON 数据集中没有记录的图片。',
    });
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

  it('does not replace committed state when preparation fails', () => {
    loadDbrDataset();
    const before = getJsonFileInfo();
    const invalid = prepareJsonProcess({ str: '{"Picture":"invalid"}', path: 'C:/datasets/invalid.json' });

    expect(invalid.success).toBe(false);
    expect(commitPreparedJsonProcess(invalid)).toBe(false);
    expect(getJsonFileInfo()).toEqual(before);
  });

  it('clears every committed dataset field when a new target is selected', () => {
    loadDbrDataset();

    clearDatasetProcess();

    expect(getJsonFileInfo()).toEqual({ str: '{}', path: '' });
    expect(getJsonImagePosition()).toEqual({ currentIndex: -1, total: 0 });
    expect(getCurrentAnnotationView()).toEqual({ formattedItems: [], quads: [] });
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

import { describe, expect, it, vi } from 'vitest';
import { DATASET_LOAD_STATUS, prepareDatasetLoad } from '../src/renderer/src/services/DatasetLoadService.js';
import { createDbrPicture, createJsonResponse } from './fixtures/DatasetFixtures.js';

describe('Dataset load service', () => {
  it('prepares a dataset and normalizes resolved image paths', async () => {
    const resolveImagePaths = vi.fn(async () => ({
      success: true,
      imagePaths: ['C:\\datasets\\images\\one.png'],
    }));
    const saveJsonFile = vi.fn(async () => true);

    const result = await prepareDatasetLoad(createJsonResponse([createDbrPicture()]), {
      resolveImagePaths,
      saveJsonFile,
    });

    expect(result.status).toBe(DATASET_LOAD_STATUS.READY);
    expect(result.jsonData.path).toBe('C:/datasets/sample.json');
    expect(result.preparedJson.imagePaths).toEqual(['C:/datasets/images/one.png']);
    expect(resolveImagePaths).toHaveBeenCalledWith({
      jsonFilePath: 'C:/datasets/sample.json',
      imagePaths: ['images/one.png'],
    });
    expect(saveJsonFile).not.toHaveBeenCalled();
  });

  it('stops before applying a lossy repair when confirmation is declined', async () => {
    const confirmLossyRepair = vi.fn(() => false);
    const resolveImagePaths = vi.fn();

    const result = await prepareDatasetLoad(createJsonResponse([null, createDbrPicture()]), {
      confirmLossyRepair,
      resolveImagePaths,
      saveJsonFile: vi.fn(),
    });

    expect(result).toEqual({
      status: DATASET_LOAD_STATUS.CANCELED,
      error: '已取消加载，原始数据未执行任何有损修复。',
    });
    expect(confirmLossyRepair).toHaveBeenCalledOnce();
    expect(resolveImagePaths).not.toHaveBeenCalled();
  });

  it('persists an approved lossy repair with an original-file backup', async () => {
    const confirmLossyRepair = vi.fn(() => true);
    const saveJsonFile = vi.fn(async () => true);

    const result = await prepareDatasetLoad(createJsonResponse([null, createDbrPicture()]), {
      confirmLossyRepair,
      resolveImagePaths: async () => ({ success: true, imagePaths: ['C:/images/one.png'] }),
      saveJsonFile,
    });

    expect(result.status).toBe(DATASET_LOAD_STATUS.READY);
    expect(result.preparedJson.lossyRepairsApplied).toBe(true);
    expect(JSON.parse(result.preparedJson.fileInfo.str).Picture).toHaveLength(1);
    expect(saveJsonFile).toHaveBeenCalledWith(result.preparedJson.fileInfo, { backupOriginal: true });
  });

  it('saves non-lossy normalization before returning the prepared dataset', async () => {
    const saveJsonFile = vi.fn(async () => true);
    const result = await prepareDatasetLoad(
      createJsonResponse([createDbrPicture({ 'No.': '9', 'Barcode Count': 7 })]),
      {
        resolveImagePaths: async () => ({ success: true, imagePaths: ['C:/images/one.png'] }),
        saveJsonFile,
      },
    );

    expect(result.status).toBe(DATASET_LOAD_STATUS.READY);
    expect(saveJsonFile).toHaveBeenCalledWith(result.preparedJson.fileInfo, { backupOriginal: false });
  });

  it('does not apply an asynchronous result after the request becomes stale', async () => {
    const saveJsonFile = vi.fn();
    const result = await prepareDatasetLoad(createJsonResponse([createDbrPicture()]), {
      resolveImagePaths: async () => ({ success: true, imagePaths: ['C:/images/one.png'] }),
      saveJsonFile,
      isCurrent: () => false,
    });

    expect(result).toEqual({ status: DATASET_LOAD_STATUS.STALE });
    expect(saveJsonFile).not.toHaveBeenCalled();
  });

  it('returns a specific failure when image paths cannot be resolved', async () => {
    const saveJsonFile = vi.fn();

    const result = await prepareDatasetLoad(createJsonResponse([createDbrPicture()]), {
      resolveImagePaths: async () => ({ success: false, error: 'path unavailable' }),
      saveJsonFile,
    });

    expect(result).toEqual({
      status: DATASET_LOAD_STATUS.FAILED,
      error: '解析图片路径失败。',
    });
    expect(saveJsonFile).not.toHaveBeenCalled();
  });

  it('does not expose a prepared dataset when normalization cannot be persisted', async () => {
    const saveJsonFile = vi.fn(async () => false);

    const result = await prepareDatasetLoad(
      createJsonResponse([createDbrPicture({ 'No.': '9', 'Barcode Count': 7 })]),
      {
        resolveImagePaths: async () => ({ success: true, imagePaths: ['C:/images/one.png'] }),
        saveJsonFile,
      },
    );

    expect(result).toEqual({
      status: DATASET_LOAD_STATUS.FAILED,
      error: '保存规范化后的 JSON 文件失败。',
    });
    expect(saveJsonFile).toHaveBeenCalledOnce();
  });

  it('returns a stable error for a failed file response', async () => {
    await expect(prepareDatasetLoad({ success: false, error: 'denied' })).resolves.toEqual({
      status: DATASET_LOAD_STATUS.FAILED,
      error: '读取 JSON 文件失败。',
    });
  });
});

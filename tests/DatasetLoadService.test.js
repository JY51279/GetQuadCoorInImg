import { describe, expect, it, vi } from 'vitest';
import { DATASET_LOAD_STATUS, prepareDatasetLoad } from '../src/renderer/src/services/DatasetLoadService.js';

function createValidPicture(overrides = {}) {
  return {
    'Image Source': 'images\\one.png',
    'No.': '1',
    'Barcode Count': 1,
    'Barcode Info': [
      {
        'Barcode Location': '0 0 10 0 10 10 0 10',
        'Barcode Hex': '',
        'Barcode Text': '',
        'Barcode Type': '',
      },
    ],
    ...overrides,
  };
}

function createSuccessResponse(pictures) {
  return {
    success: true,
    jsonInfo: {
      str: JSON.stringify({ Picture: pictures }),
      path: 'C:\\datasets\\sample.json',
      fileName: 'sample.json',
    },
  };
}

describe('Dataset load service', () => {
  it('prepares a dataset and normalizes resolved image paths', async () => {
    const resolveImagePaths = vi.fn(async () => ({
      success: true,
      imagePaths: ['C:\\datasets\\images\\one.png'],
    }));
    const saveJsonFile = vi.fn(async () => true);

    const result = await prepareDatasetLoad(createSuccessResponse([createValidPicture()]), {
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

    const result = await prepareDatasetLoad(createSuccessResponse([null, createValidPicture()]), {
      confirmLossyRepair,
      resolveImagePaths,
      saveJsonFile: vi.fn(),
    });

    expect(result).toEqual({
      status: DATASET_LOAD_STATUS.CANCELED,
      error: 'Dataset loading was canceled before any lossy repair was applied.',
    });
    expect(confirmLossyRepair).toHaveBeenCalledOnce();
    expect(resolveImagePaths).not.toHaveBeenCalled();
  });

  it('saves non-lossy normalization before returning the prepared dataset', async () => {
    const saveJsonFile = vi.fn(async () => true);
    const result = await prepareDatasetLoad(
      createSuccessResponse([createValidPicture({ 'No.': '9', 'Barcode Count': 7 })]),
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
    const result = await prepareDatasetLoad(createSuccessResponse([createValidPicture()]), {
      resolveImagePaths: async () => ({ success: true, imagePaths: ['C:/images/one.png'] }),
      saveJsonFile,
      isCurrent: () => false,
    });

    expect(result).toEqual({ status: DATASET_LOAD_STATUS.STALE });
    expect(saveJsonFile).not.toHaveBeenCalled();
  });

  it('returns a stable error for a failed file response', async () => {
    await expect(prepareDatasetLoad({ success: false, error: 'denied' })).resolves.toEqual({
      status: DATASET_LOAD_STATUS.FAILED,
      error: 'Failed to read JSON file: denied',
    });
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  IMAGE_FAILURE_ACTION,
  IMAGE_REQUEST_SOURCE,
  IMAGE_REQUEST_STATUS,
  createImageRequestService,
} from '../src/renderer/src/services/ImageRequestService.js';

function createImageResponse(requestId, overrides = {}) {
  return {
    requestId,
    success: true,
    imageInfo: {
      url: 'quad-image://one',
      path: 'C:\\images\\one.png',
      fileName: 'one.png',
      displayWidth: 640,
      displayHeight: 480,
      coordinateScaleX: 1,
      coordinateScaleY: 1,
    },
    ...overrides,
  };
}

describe('Image request service', () => {
  it('creates distinct manual and dataset request identities', () => {
    const service = createImageRequestService();
    const manualRequest = service.beginManualRequest(4);
    const datasetRequest = service.beginDatasetRequest({
      operationId: 5,
      target: { index: 2, path: 'two.png' },
      direction: 'next',
      currentImageIndex: 1,
    });

    expect(manualRequest).toMatchObject({ requestId: 1, operationId: 4, source: IMAGE_REQUEST_SOURCE.MANUAL });
    expect(datasetRequest).toMatchObject({
      requestId: 2,
      operationId: 5,
      source: IMAGE_REQUEST_SOURCE.DATASET,
      targetImageIndex: 2,
    });
    expect([...datasetRequest.attemptedIndexes]).toEqual([1, 2]);
  });

  it('loads and validates the current prepared image response', async () => {
    const loadedImage = { naturalWidth: 640, naturalHeight: 480 };
    const loadImage = vi.fn(async () => loadedImage);
    const service = createImageRequestService({ loadImage });
    const request = service.beginManualRequest(7);

    const result = await service.handleResponse(createImageResponse(request.requestId), {
      isOperationCurrent: operationId => operationId === 7,
    });

    expect(result).toMatchObject({
      status: IMAGE_REQUEST_STATUS.READY,
      request,
      image: loadedImage,
      coordinateScale: { x: 1, y: 1 },
      imageInfo: { path: 'C:/images/one.png' },
    });
    expect(loadImage).toHaveBeenCalledWith('quad-image://one');
  });

  it('ignores responses with a stale request or workflow operation', async () => {
    const loadImage = vi.fn();
    const service = createImageRequestService({ loadImage });
    const request = service.beginManualRequest(3);

    await expect(
      service.handleResponse(createImageResponse(request.requestId + 1), {
        isOperationCurrent: () => true,
      }),
    ).resolves.toEqual({ status: IMAGE_REQUEST_STATUS.STALE });
    await expect(
      service.handleResponse(createImageResponse(request.requestId), {
        isOperationCurrent: () => false,
      }),
    ).resolves.toEqual({ status: IMAGE_REQUEST_STATUS.STALE });
    expect(loadImage).not.toHaveBeenCalled();
  });

  it('ignores a decoded image when its request becomes stale during loading', async () => {
    let finishLoading;
    const loadImage = vi.fn(
      () =>
        new Promise(resolve => {
          finishLoading = resolve;
        }),
    );
    const service = createImageRequestService({ loadImage });
    const firstRequest = service.beginManualRequest(1);
    const responsePromise = service.handleResponse(createImageResponse(firstRequest.requestId));
    service.beginManualRequest(2);
    finishLoading({ naturalWidth: 640, naturalHeight: 480 });

    await expect(responsePromise).resolves.toEqual({ status: IMAGE_REQUEST_STATUS.STALE });
  });

  it('rejects invalid coordinate scales and mismatched decoded dimensions', async () => {
    const loadImage = vi.fn(async () => ({ naturalWidth: 320, naturalHeight: 240 }));
    const service = createImageRequestService({ loadImage });
    const scaleRequest = service.beginManualRequest(1);
    const invalidScaleResponse = createImageResponse(scaleRequest.requestId);
    invalidScaleResponse.imageInfo.coordinateScaleX = 0;

    await expect(service.handleResponse(invalidScaleResponse)).resolves.toMatchObject({
      status: IMAGE_REQUEST_STATUS.FAILED,
      error: 'The prepared image coordinate scale must contain two positive finite values.',
    });
    expect(loadImage).not.toHaveBeenCalled();

    const sizeRequest = service.beginManualRequest(2);
    await expect(service.handleResponse(createImageResponse(sizeRequest.requestId))).resolves.toMatchObject({
      status: IMAGE_REQUEST_STATUS.FAILED,
      error: 'The prepared image dimensions do not match the loaded image.',
    });
  });

  it('classifies cancellation and transport failures', async () => {
    const invoke = vi.fn(async () => {
      throw new Error('decode failed');
    });
    const service = createImageRequestService({ invoke });
    const canceledRequest = service.beginManualRequest(1);

    await expect(
      service.handleResponse({ requestId: canceledRequest.requestId, canceled: true }),
    ).resolves.toMatchObject({ status: IMAGE_REQUEST_STATUS.CANCELED, request: canceledRequest });

    const failedRequest = service.beginDatasetRequest({
      operationId: 2,
      target: { index: 0, path: 'C:\\images\\missing.png' },
      direction: 'next',
    });
    await expect(service.execute('prepare-image', { requestId: failedRequest.requestId })).resolves.toMatchObject({
      status: IMAGE_REQUEST_STATUS.FAILED,
      request: failedRequest,
      error: 'decode failed',
      path: 'C:/images/missing.png',
    });
  });

  it('retries each dataset index at most once before choosing restoration or clearing', () => {
    const getAdjacentTarget = vi
      .fn()
      .mockReturnValueOnce({ success: true, index: 2, path: 'two.png' })
      .mockReturnValue({ success: true, index: 0, path: 'zero.png' });
    const service = createImageRequestService({ getAdjacentTarget });
    const firstRequest = service.beginDatasetRequest({
      operationId: 8,
      target: { index: 1, path: 'one.png' },
      direction: 'next',
      currentImageIndex: 0,
    });

    const retryPlan = service.planFailure({ canRestorePreviousImage: true });
    expect(retryPlan).toMatchObject({
      action: IMAGE_FAILURE_ACTION.RETRY,
      target: { index: 2, path: 'two.png' },
      previousRequest: firstRequest,
    });
    service.beginDatasetRequest({
      target: retryPlan.target,
      direction: firstRequest.direction,
      previousRequest: firstRequest,
    });

    expect(service.planFailure({ canRestorePreviousImage: true }).action).toBe(IMAGE_FAILURE_ACTION.RESTORE);
    expect(service.planFailure({ canRestorePreviousImage: false }).action).toBe(IMAGE_FAILURE_ACTION.CLEAR);
  });
});

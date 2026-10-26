import { nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useAnnotationImagePreparation } from '../src/renderer/src/composables/useAnnotationImagePreparation.js';

function createPreparation(overrides = {}) {
  const allowed = ref(true);
  const imagePath = ref('C:/data/a.jpg');
  const quads = ref([{ regionIndex: 0, points: [{ x: 1, y: 2 }] }]);
  const prepareImages =
    overrides.prepareImages ??
    vi.fn(request =>
      Promise.resolve({
        success: true,
        requestId: request.requestId,
        regions: [{ regionIndex: 0, url: 'quad-image://cache/one' }],
      }),
    );
  const submitVisual = overrides.submitVisual ?? vi.fn();
  const preparation = useAnnotationImagePreparation({
    canStart: () => allowed.value,
    getImagePath: () => imagePath.value,
    getQuadSnapshot: () => ({ success: true, quads: JSON.parse(JSON.stringify(quads.value)) }),
    getQuadSignature: () => JSON.stringify(quads.value),
    prepareImages,
    submitVisual,
    ...overrides,
  });
  return { preparation, allowed, imagePath, quads, prepareImages, submitVisual };
}

describe('Annotation image preparation', () => {
  it('prepares and submits a visual input snapshot', async () => {
    const { preparation, prepareImages, submitVisual } = createPreparation();

    await preparation.prepare();

    expect(prepareImages).toHaveBeenCalledWith({
      requestId: 1,
      imagePath: 'C:/data/a.jpg',
      quads: [{ regionIndex: 0, points: [{ x: 1, y: 2 }] }],
    });
    expect(preparation.canSubmit.value).toBe(true);
    preparation.submit();
    expect(submitVisual).toHaveBeenCalledWith({
      regions: [{ regionIndex: 0, url: 'quad-image://cache/one' }],
      snapshot: {
        imagePath: 'C:/data/a.jpg',
        quadSignature: JSON.stringify([{ regionIndex: 0, points: [{ x: 1, y: 2 }] }]),
        quads: [{ regionIndex: 0, points: [{ x: 1, y: 2 }] }],
      },
    });
  });

  it('reports invalid snapshots without invoking image preparation', async () => {
    const prepareImages = vi.fn();
    const { preparation } = createPreparation({
      getQuadSnapshot: () => ({ success: false, error: '没有可用的码区。' }),
      prepareImages,
    });

    await preparation.prepare();

    expect(prepareImages).not.toHaveBeenCalled();
    expect(preparation.error.value).toBe('没有可用的码区。');
    expect(preparation.canSubmit.value).toBe(false);
  });

  it('invalidates prepared regions when the image or quads change', async () => {
    const { preparation, imagePath, quads } = createPreparation();
    await preparation.prepare();
    const preparedSnapshot = {
      imagePath: 'C:/data/a.jpg',
      quadSignature: JSON.stringify(quads.value),
    };
    expect(preparation.isSnapshotCurrent(preparedSnapshot)).toBe(true);

    quads.value = [{ regionIndex: 0, points: [{ x: 3, y: 4 }] }];
    await nextTick();

    expect(preparation.regions.value).toEqual([]);
    expect(preparation.error.value).toBe('码区坐标已变化，请重新生成局部图。');
    expect(preparation.isSnapshotCurrent(preparedSnapshot)).toBe(false);

    await preparation.prepare();
    imagePath.value = 'C:/data/b.jpg';
    await nextTick();
    expect(preparation.regions.value).toEqual([]);
    expect(preparation.error.value).toBe('');
  });

  it('ignores stale responses and late responses after disposal', async () => {
    let resolveFirst;
    let resolveSecond;
    const prepareImages = vi
      .fn()
      .mockImplementationOnce(
        request =>
          new Promise(resolve => {
            resolveFirst = result => resolve({ requestId: request.requestId, ...result });
          }),
      )
      .mockImplementationOnce(
        request =>
          new Promise(resolve => {
            resolveSecond = result => resolve({ requestId: request.requestId, ...result });
          }),
      );
    const { preparation, imagePath } = createPreparation({ prepareImages });

    const first = preparation.prepare();
    imagePath.value = 'C:/data/b.jpg';
    await nextTick();
    resolveFirst({ success: true, regions: [{ url: 'stale' }] });
    await first;
    expect(preparation.regions.value).toEqual([]);

    const second = preparation.prepare();
    preparation.dispose();
    resolveSecond({ success: true, regions: [{ url: 'late' }] });
    await second;
    expect(preparation.regions.value).toEqual([]);
    expect(preparation.canPrepare.value).toBe(false);
  });

  it('surfaces service failures and blocks preparation while unavailable', async () => {
    const { preparation, allowed, prepareImages } = createPreparation({
      prepareImages: vi.fn(() => Promise.reject('unavailable')),
    });

    await preparation.prepare();
    expect(preparation.error.value).toBe('生成码区局部图失败。');

    prepareImages.mockClear();
    allowed.value = false;
    await preparation.prepare();
    expect(prepareImages).not.toHaveBeenCalled();
    expect(preparation.canPrepare.value).toBe(false);
  });
});

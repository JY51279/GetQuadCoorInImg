import { computed, nextTick, reactive, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useZoomPreview } from '../src/renderer/src/composables/useZoomPreview.js';

function createPreview({ canvasAvailable = true, imageComplete = true } = {}) {
  const context = {
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    drawImage: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
  };
  const canvas = {
    width: 120,
    height: 120,
    style: {},
    getContext: vi.fn(() => context),
  };
  const rawPixelRatio = ref(1);
  const image = ref({ complete: imageComplete });
  const points = reactive([{ x: 11, y: 22 }]);
  const preview = useZoomPreview({
    getCanvas: () => (canvasAvailable ? canvas : null),
    pixelRatio: computed(() => rawPixelRatio.value),
    image,
    points,
  });
  return { preview, context, canvas, rawPixelRatio, image, points };
}

describe('Zoom preview coordination', () => {
  it('configures the canvas and draws the current image origin', () => {
    const { preview, context, canvas } = createPreview();

    expect(preview.syncCanvasPixelRatio()).toBe(true);
    expect(preview.update({ x: 10, y: 20 })).toBe(true);

    expect(canvas).toMatchObject({ width: 120, height: 120 });
    expect(context.setTransform).toHaveBeenCalledWith(1, 0, 0, 1, 0, 0);
    expect(context.drawImage).toHaveBeenCalled();
    expect(context.fillRect).toHaveBeenCalledWith(20, 40, 20, 20);
  });

  it('redraws for point and pixel-ratio changes', async () => {
    const { preview, context, rawPixelRatio, points } = createPreview();
    preview.syncCanvasPixelRatio();
    preview.update({ x: 10, y: 20 });
    context.drawImage.mockClear();

    points.push({ x: 12, y: 23 });
    await nextTick();
    expect(context.drawImage).toHaveBeenCalledTimes(1);

    rawPixelRatio.value = 2;
    await nextTick();
    expect(context.setTransform).toHaveBeenLastCalledWith(2, 0, 0, 2, 0, 0);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
  });

  it('clears the canvas and requires a new origin after reset', () => {
    const { preview, context, canvas } = createPreview();
    preview.syncCanvasPixelRatio();
    preview.update({ x: 10, y: 20 });
    context.drawImage.mockClear();

    preview.reset();

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, canvas.width, canvas.height);
    expect(preview.update()).toBe(false);
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('ignores unavailable inputs and stops reactive drawing after disposal', async () => {
    const unavailable = createPreview({ canvasAvailable: false });
    expect(unavailable.preview.syncCanvasPixelRatio()).toBe(false);
    expect(unavailable.preview.update({ x: Number.NaN, y: 1 })).toBe(false);
    unavailable.preview.dispose();

    const { preview, context, points } = createPreview({ imageComplete: false });
    expect(preview.update({ x: 1, y: 1 })).toBe(false);
    preview.dispose();
    points.push({ x: 2, y: 2 });
    await nextTick();
    expect(context.drawImage).not.toHaveBeenCalled();
  });
});

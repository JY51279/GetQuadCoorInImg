import { describe, expect, it } from 'vitest';
import { useImageViewport } from '../src/renderer/src/composables/useImageViewport.js';

describe('Image viewport state', () => {
  it('fits an image and derives one visible region in pixel-grid mode', () => {
    const viewport = useImageViewport();
    viewport.setViewportSize(550, 550);
    viewport.setImageSize(50, 50);

    expect(viewport.fitImageToViewport()).toBe(true);
    expect(viewport.scale.value).toBe(10);
    expect(viewport.pixelPitch.value).toBe(11);
    expect(viewport.updateVisibleRegion()).toEqual({
      sourceWidth: 50,
      sourceHeight: 50,
      canvasWidth: 550,
      canvasHeight: 550,
    });
    expect(viewport.sourceLeftTop).toEqual({ x: 0, y: 0 });
    expect(viewport.sourceRightBottom).toEqual({ x: 49, y: 49 });
    expect(viewport.canvasLeftTop).toEqual({ x: 0, y: 0 });
    expect(viewport.canvasRightBottom).toEqual({ x: 550, y: 550 });
  });

  it('accumulates movement while an image edge remains snapped', () => {
    const viewport = useImageViewport();
    viewport.setViewportSize(50, 50);
    viewport.setImageSize(100, 100);
    viewport.applyTransform({ scale: 1, offsetX: 0, offsetY: 0 });
    viewport.beginPanGesture();

    for (let step = 0; step < 9; step++) {
      expect(viewport.panBy(-1, 0)).toEqual({ changed: true, becameInvisible: false });
      expect(viewport.offsetX.value).toBe(0);
    }
    viewport.panBy(-1, 0);

    expect(viewport.offsetX.value).toBe(-10);
    expect(viewport.offsetY.value).toBe(0);
  });

  it('keeps the same image position under the pointer across the grid threshold', () => {
    const viewport = useImageViewport();
    viewport.setViewportSize(500, 500);
    viewport.setImageSize(1000, 1000);
    viewport.applyTransform({ scale: 9.9, offsetX: -120, offsetY: -80 });
    const pointer = { x: 250, y: 200 };
    const imageXBeforeZoom = (pointer.x - viewport.offsetX.value) / viewport.pixelPitch.value;
    const imageYBeforeZoom = (pointer.y - viewport.offsetY.value) / viewport.pixelPitch.value;

    expect(viewport.updateScale(10, { anchorPoint: pointer })).toEqual({
      changed: true,
      becameInvisible: false,
    });

    expect((pointer.x - viewport.offsetX.value) / viewport.pixelPitch.value).toBeCloseTo(imageXBeforeZoom);
    expect((pointer.y - viewport.offsetY.value) / viewport.pixelPitch.value).toBeCloseTo(imageYBeforeZoom);
  });

  it('owns reversible image and canvas coordinates', () => {
    const viewport = useImageViewport();
    viewport.setImageSize(100, 100);
    viewport.applyTransform({ scale: 10, offsetX: 5, offsetY: -3 });
    const imagePoint = { x: 12, y: 8 };
    const canvasPoint = viewport.imageToCanvas(imagePoint);

    expect(canvasPoint).toEqual({ x: 137, y: 85 });
    expect(viewport.canvasToImage(canvasPoint)).toEqual(imagePoint);
  });

  it('clears image-specific state without discarding the viewport size', () => {
    const viewport = useImageViewport();
    viewport.setViewportSize(800, 600);
    viewport.setImageSize(100, 50);
    viewport.applyTransform({ scale: 4, offsetX: 20, offsetY: -10 });
    viewport.updateVisibleRegion();

    viewport.clear();

    expect(viewport.scale.value).toBe(0);
    expect(viewport.imageWidth.value).toBe(0);
    expect(viewport.imageHeight.value).toBe(0);
    expect(viewport.offsetX.value).toBe(0);
    expect(viewport.offsetY.value).toBe(0);
    expect(viewport.canvasRightBottom).toEqual({ x: 0, y: 0 });
    expect(viewport.sourceRightBottom).toEqual({ x: 0, y: 0 });
    expect(viewport.viewportWidth.value).toBe(800);
    expect(viewport.viewportHeight.value).toBe(600);
  });
});

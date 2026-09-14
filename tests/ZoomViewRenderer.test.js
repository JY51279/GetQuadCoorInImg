import { describe, expect, it, vi } from 'vitest';
import { configureZoomCanvas, drawZoomPreview } from '../src/renderer/src/utils/ZoomViewRenderer.js';

describe('Zoom preview renderer', () => {
  function createCanvasContext() {
    const context = {
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
    };
    return { context, canvas: { getContext: () => context } };
  }

  it('disables smoothing and draws only points inside the 6 by 6 source area', () => {
    const { context, canvas } = createCanvasContext();
    const image = { id: 'image' };

    configureZoomCanvas(canvas);
    drawZoomPreview(canvas, image, { x: 10, y: 20 }, [
      { x: 11, y: 22 },
      { x: 15, y: 25 },
      { x: 9, y: 20 },
      { x: 16, y: 20 },
    ]);

    expect(context.imageSmoothingEnabled).toBe(false);
    expect(context.drawImage).toHaveBeenCalledWith(image, 10, 20, 6, 6, 0, 0, 120, 120);
    expect(context.fillRect.mock.calls).toEqual([
      [20, 40, 20, 20],
      [100, 100, 20, 20],
    ]);
    expect(context.strokeRect).toHaveBeenCalledWith(60, 60, 20, 20);
  });
});

/* global globalThis */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canvasToImagePoint,
  imageToCanvasPoint,
  imageToScaledPoint,
  normalizeScale,
  scaledToCanvasPoint,
  scaledToImagePoint,
} from '../src/renderer/src/utils/ImageViewGeometry.js';
import { configureZoomCanvas, drawZoomPreview } from '../src/renderer/src/utils/ZoomViewRenderer.js';
import { loadRendererImage } from '../src/renderer/src/utils/RendererImageLoader.js';

describe('Image view geometry', () => {
  it('keeps scale values finite and inside the supported range', () => {
    expect(normalizeScale('2.5')).toBe(2.5);
    expect(normalizeScale(-2)).toBe(0.1);
    expect(normalizeScale(100)).toBe(60);
    expect(normalizeScale('', 0.1, 60, 2)).toBe(0.1);
    expect(normalizeScale('invalid', 0.1, 60, 2)).toBe(2);
  });

  it('converts normal image, scaled, and canvas coordinates', () => {
    const transform = {
      scale: 2,
      gridLimit: 10,
      sourceLeftTop: { x: 0, y: 0 },
      canvasLeftTop: { x: 0, y: 0 },
      offsetX: 5,
      offsetY: -3,
      canvasOffsetLeft: 22,
      canvasOffsetTop: 22,
    };
    const imagePoint = { x: 12, y: 8 };

    expect(imageToScaledPoint(imagePoint, 2)).toEqual({ x: 24, y: 16 });
    expect(scaledToImagePoint({ x: 25, y: 17 }, 2)).toEqual({ x: 12, y: 8 });
    expect(imageToCanvasPoint(imagePoint, transform)).toEqual({ x: 51, y: 35 });
    expect(canvasToImagePoint({ x: 51, y: 35 }, transform)).toEqual(imagePoint);
    expect(scaledToCanvasPoint({ x: 24, y: 16 }, transform)).toEqual({ x: 51, y: 35 });
  });

  it('keeps coordinates reversible in pixel-grid mode', () => {
    const transform = {
      scale: 10,
      gridLimit: 10,
      sourceLeftTop: { x: 10, y: 5 },
      canvasLeftTop: { x: 127, y: 69 },
      offsetX: 5,
      offsetY: -3,
      canvasOffsetLeft: 22,
      canvasOffsetTop: 22,
    };
    const imagePoint = { x: 12, y: 8 };
    const canvasPoint = imageToCanvasPoint(imagePoint, transform);

    expect(canvasPoint).toEqual({ x: 149, y: 102 });
    expect(canvasToImagePoint(canvasPoint, transform)).toEqual(imagePoint);
    expect(scaledToCanvasPoint({ x: 120, y: 80 }, transform)).toEqual(canvasPoint);
  });
});

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

describe('Renderer image loader', () => {
  const originalImage = globalThis.Image;
  const originalDocument = globalThis.document;

  afterEach(() => {
    globalThis.Image = originalImage;
    globalThis.document = originalDocument;
  });

  function installImageMocks() {
    const imageSizes = new Map([
      ['small-image', { width: 640, height: 480 }],
      ['large-image', { width: 4000, height: 2000 }],
      ['resized-image', { width: 3072, height: 1536 }],
    ]);
    const createdImages = [];
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toDataURL: () => 'resized-image',
    };

    globalThis.Image = class MockImage {
      constructor() {
        this.complete = false;
        createdImages.push(this);
      }

      get src() {
        return this.imageSource;
      }

      set src(value) {
        this.imageSource = value;
        queueMicrotask(() => {
          const size = imageSizes.get(value);
          if (!size) {
            this.onerror?.(new Error('Unknown mock image.'));
            return;
          }
          this.width = size.width;
          this.height = size.height;
          this.complete = true;
          this.onload?.();
        });
      }
    };
    globalThis.document = { createElement: vi.fn(() => canvas) };

    return { canvas, createdImages, drawImage };
  }

  it('keeps small images at their original size', async () => {
    const { createdImages } = installImageMocks();
    const result = await loadRendererImage('small-image');

    expect(result.image).toBe(createdImages[0]);
    expect(result.initialScale).toBe(1);
    expect(globalThis.document.createElement).not.toHaveBeenCalled();
  });

  it('limits large images to a longest side of 3072 pixels', async () => {
    const { canvas, createdImages, drawImage } = installImageMocks();
    const result = await loadRendererImage('large-image');

    expect(result.initialScale).toBeCloseTo(0.768);
    expect(canvas.width).toBe(3072);
    expect(canvas.height).toBe(1536);
    expect(drawImage).toHaveBeenCalledWith(createdImages[0], 0, 0, 3072, 1536);
    expect(result.image).toBe(createdImages[1]);
  });
});

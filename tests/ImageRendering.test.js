/* global globalThis */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculateQuadFocusTransform,
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

  it('fits a Quad and its context into 75 percent of the limiting viewport dimension', () => {
    const result = calculateQuadFocusTransform(
      [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 100, y: 50 },
        { x: 0, y: 50 },
      ],
      { viewportWidth: 1000, viewportHeight: 800 },
    );

    expect(result).toEqual({
      scale: 5,
      offsetX: 250,
      offsetY: 275,
      focusBounds: { left: -25, right: 125, top: -25, bottom: 75 },
    });
  });

  it('centers a distant small Quad while accounting for pixel-grid spacing', () => {
    const quad = [
      { x: 1000, y: 600 },
      { x: 1010, y: 600 },
      { x: 1010, y: 610 },
      { x: 1000, y: 610 },
    ];
    const result = calculateQuadFocusTransform(quad, { viewportWidth: 1000, viewportHeight: 800 });
    const visualPixelSize = result.scale + 1;
    const sourceLeft = Math.floor(Math.max(0, -result.offsetX) / result.scale);
    const sourceTop = Math.floor(Math.max(0, -result.offsetY) / result.scale);
    const centeredX = 1005 * result.scale + (1005 - sourceLeft) + result.offsetX;
    const centeredY = 605 * result.scale + (605 - sourceTop) + result.offsetY;

    expect(result.scale).toBeGreaterThanOrEqual(10);
    expect((result.focusBounds.bottom - result.focusBounds.top) * visualPixelSize).toBeCloseTo(800 * 0.75);
    expect(centeredX).toBeCloseTo(500);
    expect(centeredY).toBeCloseTo(400);
  });

  it('rejects invalid Quad focus input', () => {
    expect(calculateQuadFocusTransform([], { viewportWidth: 1000, viewportHeight: 800 })).toBeNull();
    expect(
      calculateQuadFocusTransform(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: Number.NaN },
          { x: 0, y: 1 },
        ],
        { viewportWidth: 1000, viewportHeight: 800 },
      ),
    ).toBeNull();
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

  afterEach(() => {
    globalThis.Image = originalImage;
  });

  function installImageMocks() {
    const imageSizes = new Map([
      ['small-image', { width: 640, height: 480 }],
      ['prepared-image', { width: 3072, height: 1536 }],
    ]);
    const createdImages = [];

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
          this.naturalWidth = size.width;
          this.naturalHeight = size.height;
          this.complete = true;
          this.onload?.();
        });
      }
    };

    return { createdImages };
  }

  it('loads a prepared image without allocating a resize canvas', async () => {
    const { createdImages } = installImageMocks();
    const result = await loadRendererImage('prepared-image');

    expect(result).toBe(createdImages[0]);
    expect(result.crossOrigin).toBe('anonymous');
    expect(result.naturalWidth).toBe(3072);
    expect(createdImages).toHaveLength(1);
  });

  it('rejects when the prepared image URL cannot be decoded', async () => {
    installImageMocks();

    await expect(loadRendererImage('missing-image')).rejects.toThrow('Unknown mock image.');
  });
});

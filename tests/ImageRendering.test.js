/* global globalThis */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calculatePixelFocusTransform,
  calculateQuadFocusTransform,
  canvasToImagePoint,
  imageToCanvasPoint,
  imageToScaledPoint,
  normalizeScale,
  scaledToCanvasPoint,
  scaledToImagePoint,
} from '../src/renderer/src/utils/ImageViewGeometry.js';
import { getOuterInnerQuads } from '../src/renderer/src/utils/ImageProcess.js';
import { configureZoomCanvas, drawZoomPreview } from '../src/renderer/src/utils/ZoomViewRenderer.js';
import { loadRendererImage } from '../src/renderer/src/utils/RendererImageLoader.js';

function getFocusedOuterQuadBounds(quad, focusTransform, gridLimit = 10) {
  const sourceLeftTop = {
    x: Math.floor(Math.max(0, -focusTransform.offsetX) / focusTransform.scale),
    y: Math.floor(Math.max(0, -focusTransform.offsetY) / focusTransform.scale),
  };
  const coordinateTransform = {
    scale: focusTransform.scale,
    gridLimit,
    sourceLeftTop,
    offsetX: focusTransform.offsetX,
    offsetY: focusTransform.offsetY,
    canvasOffsetLeft: 0,
    canvasOffsetTop: 0,
  };
  const quadPointsInCanvas = quad.map(point => imageToCanvasPoint(point, coordinateTransform));
  const { outerQuadPoints } = getOuterInnerQuads(quadPointsInCanvas, focusTransform.scale);
  const xValues = outerQuadPoints.map(point => point.x);
  const yValues = outerQuadPoints.map(point => point.y);

  return {
    left: Math.min(...xValues),
    right: Math.max(...xValues),
    top: Math.min(...yValues),
    bottom: Math.max(...yValues),
  };
}

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

  it('centers the rendered Quad pixels and fits their context into 75 percent of the viewport', () => {
    const quad = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    const result = calculateQuadFocusTransform(quad, { viewportWidth: 1000, viewportHeight: 800 });
    const outerBounds = getFocusedOuterQuadBounds(quad, result);

    expect(result.focusBounds).toEqual({ left: -26, right: 127, top: -26, bottom: 77 });
    expect((result.focusBounds.right - result.focusBounds.left) * result.scale).toBeCloseTo(1000 * 0.75);
    expect((outerBounds.left + outerBounds.right) / 2).toBeCloseTo(500);
    expect((outerBounds.top + outerBounds.bottom) / 2).toBeCloseTo(400);
  });

  it('centers a distant small Quad while accounting for pixel-grid spacing', () => {
    const quad = [
      { x: 1000, y: 600 },
      { x: 1010, y: 600 },
      { x: 1010, y: 610 },
      { x: 1000, y: 610 },
    ];
    const result = calculateQuadFocusTransform(quad, { viewportWidth: 1000, viewportHeight: 800 });
    const outerBounds = getFocusedOuterQuadBounds(quad, result);
    const focusPixelCount = result.focusBounds.bottom - result.focusBounds.top;
    const visualFocusHeight = focusPixelCount * (result.scale + 1) - 1;

    expect(result.scale).toBeGreaterThanOrEqual(10);
    expect(Math.abs(visualFocusHeight - 800 * 0.75)).toBeLessThanOrEqual(1);
    expect(Math.abs((outerBounds.left + outerBounds.right) / 2 - 500)).toBeLessThanOrEqual(1);
    expect(Math.abs((outerBounds.top + outerBounds.bottom) / 2 - 400)).toBeLessThanOrEqual(1);
  });

  it('centers one rendered pixel at the standard local editing scale', () => {
    const imagePoint = { x: 123, y: 45 };
    const result = calculatePixelFocusTransform(imagePoint, { viewportWidth: 1000, viewportHeight: 800 });
    const coordinateTransform = {
      scale: result.scale,
      gridLimit: 10,
      sourceLeftTop: {
        x: Math.floor(Math.max(0, -result.offsetX) / result.scale),
        y: Math.floor(Math.max(0, -result.offsetY) / result.scale),
      },
      offsetX: result.offsetX,
      offsetY: result.offsetY,
      canvasOffsetLeft: 0,
      canvasOffsetTop: 0,
    };
    const pixelTopLeft = imageToCanvasPoint(imagePoint, coordinateTransform);

    expect(result.scale).toBe(9.9);
    expect(Math.abs(pixelTopLeft.x + result.scale / 2 - 500)).toBeLessThanOrEqual(1);
    expect(Math.abs(pixelTopLeft.y + result.scale / 2 - 400)).toBeLessThanOrEqual(1);
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
    expect(
      calculatePixelFocusTransform({ x: Number.NaN, y: 0 }, { viewportWidth: 1000, viewportHeight: 800 }),
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

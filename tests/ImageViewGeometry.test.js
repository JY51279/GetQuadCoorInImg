import { describe, expect, it } from 'vitest';
import {
  calculateFitScale,
  calculateWheelScale,
  calculatePixelFocusTransform,
  calculatePointerAnchoredOffset,
  calculateQuadFocusTransform,
  calculateSnappedPanOffset,
  calculateVisibleImageAxis,
  canvasToImagePoint,
  clientToLocalPoint,
  getRenderedImageSize,
  getRenderedPixelPitch,
  imageToCanvasPoint,
  imageToScaledPoint,
  hasExceededPointerDragThreshold,
  normalizeScale,
  scaleToSliderPosition,
  scaledToCanvasPoint,
  scaledToImagePoint,
  sliderPositionToScale,
} from '../src/renderer/src/utils/ImageViewGeometry.js';
import { getOuterInnerQuads } from '../src/renderer/src/utils/ImageProcess.js';

function getFocusedOuterQuadBounds(quad, focusTransform, gridLimit = 10) {
  const coordinateTransform = {
    scale: focusTransform.scale,
    gridLimit,
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

function createRectQuad(left, top, right, bottom) {
  return [
    { x: left, y: top },
    { x: right, y: top },
    { x: right, y: bottom },
    { x: left, y: bottom },
  ];
}

function expectVisibleFocusedQuad(quad, transform, viewportWidth, viewportHeight, padding = 16) {
  const bounds = getFocusedOuterQuadBounds(quad, transform);
  const tolerance = 1e-8;
  expect(bounds.left).toBeGreaterThanOrEqual(padding - tolerance);
  expect(bounds.top).toBeGreaterThanOrEqual(padding - tolerance);
  expect(bounds.right).toBeLessThanOrEqual(viewportWidth - padding + tolerance);
  expect(bounds.bottom).toBeLessThanOrEqual(viewportHeight - padding + tolerance);
  // The final grid gutter is outside the rendered Quad outline.
  expect(Math.abs((bounds.left + bounds.right) / 2 - viewportWidth / 2)).toBeLessThanOrEqual(0.5 + tolerance);
  expect(Math.abs((bounds.top + bounds.bottom) / 2 - viewportHeight / 2)).toBeLessThanOrEqual(0.5 + tolerance);
}

describe('Image view geometry', () => {
  it('converts window client coordinates into viewport-local coordinates', () => {
    expect(clientToLocalPoint({ x: 425, y: 218 }, { left: 100, top: 40 }, { left: 1, top: 2 })).toEqual({
      x: 324,
      y: 176,
    });
    expect(clientToLocalPoint({ x: Number.NaN, y: 0 }, { left: 0, top: 0 })).toBeNull();
  });

  it('keeps scale values finite and inside the supported range', () => {
    expect(normalizeScale('2.5')).toBe(2.5);
    expect(normalizeScale(-2)).toBe(0.1);
    expect(normalizeScale(100)).toBe(60);
    expect(normalizeScale('', 0.1, 60, 2)).toBe(0.1);
    expect(normalizeScale('invalid', 0.1, 60, 2)).toBe(2);
  });

  it('maps the scale slider logarithmically while preserving exact scale round trips', () => {
    const positions = [0.1, 1, 10, 60].map(scaleToSliderPosition);
    expect(positions[0]).toBeCloseTo(0);
    expect(positions[1]).toBeGreaterThan(30);
    expect(positions[2]).toBeGreaterThan(positions[1] + 30);
    expect(positions[3]).toBeCloseTo(100);

    for (const scale of [0.1, 0.5, 1, 4, 10, 25, 60]) {
      expect(sliderPositionToScale(scaleToSliderPosition(scale))).toBeCloseTo(scale, 8);
    }
  });

  it('zooms the mouse wheel proportionally and stops at the pixel-grid threshold', () => {
    const zoomedIn = calculateWheelScale(1, -100);
    expect(zoomedIn).toBeCloseTo(Math.pow(2, 1 / 6), 7);
    expect(calculateWheelScale(zoomedIn, 100)).toBeCloseTo(1, 7);
    expect(calculateWheelScale(9.5, -100)).toBe(10);
    expect(calculateWheelScale(10.5, 100)).toBe(10);
    expect(calculateWheelScale(60, -100)).toBe(60);
    expect(calculateWheelScale(0.1, 100)).toBe(0.1);
  });

  it('accumulates slow pointer movement while an image edge remains snapped', () => {
    let pan = { rawOffset: 0, renderedOffset: 0 };

    for (let step = 0; step < 9; step++) {
      pan = calculateSnappedPanOffset(pan.rawOffset, pan.renderedOffset, -1, {
        leadingBoundary: 0,
        trailingBoundary: -400,
      });
      expect(pan.renderedOffset).toBe(0);
    }

    pan = calculateSnappedPanOffset(pan.rawOffset, pan.renderedOffset, -1, {
      leadingBoundary: 0,
      trailingBoundary: -400,
    });
    expect(pan).toEqual({ rawOffset: -10, renderedOffset: -10 });
  });

  it('preserves directional edge snapping while approaching a boundary', () => {
    expect(
      calculateSnappedPanOffset(12, 12, -3, {
        leadingBoundary: 0,
        trailingBoundary: -400,
      }),
    ).toEqual({ rawOffset: 9, renderedOffset: 0 });
    expect(
      calculateSnappedPanOffset(-412, -412, 3, {
        leadingBoundary: 0,
        trailingBoundary: -400,
      }),
    ).toEqual({ rawOffset: -409, renderedOffset: -400 });
  });

  it('releases every snapped edge after cumulative movement reaches the snap distance', () => {
    const cases = [
      { start: 0, delta: -1, leadingBoundary: 0, trailingBoundary: -400, expected: -10 },
      { start: -400, delta: 1, leadingBoundary: 0, trailingBoundary: -400, expected: -390 },
      { start: 0, delta: -1, leadingBoundary: 0, trailingBoundary: -300, expected: -10 },
      { start: -300, delta: 1, leadingBoundary: 0, trailingBoundary: -300, expected: -290 },
    ];

    for (const testCase of cases) {
      let pan = { rawOffset: testCase.start, renderedOffset: testCase.start };
      for (let step = 0; step < 10; step++) {
        pan = calculateSnappedPanOffset(pan.rawOffset, pan.renderedOffset, testCase.delta, testCase);
      }
      expect(pan.rawOffset).toBe(testCase.expected);
      expect(pan.renderedOffset).toBe(testCase.expected);
    }
  });

  it('can leave coincident boundaries when the image exactly fits the viewport', () => {
    let pan = { rawOffset: 0, renderedOffset: 0 };
    for (let step = 0; step < 10; step++) {
      pan = calculateSnappedPanOffset(pan.rawOffset, pan.renderedOffset, 1, {
        leadingBoundary: 0,
        trailingBoundary: 0,
      });
    }

    expect(pan).toEqual({ rawOffset: 10, renderedOffset: 10 });
  });

  it('distinguishes a tolerant pointer click from a canvas drag', () => {
    const startPoint = { x: 100, y: 100 };

    expect(hasExceededPointerDragThreshold(startPoint, { x: 103, y: 102 })).toBe(false);
    expect(hasExceededPointerDragThreshold(startPoint, { x: 104, y: 100 })).toBe(false);
    expect(hasExceededPointerDragThreshold(startPoint, { x: 104, y: 101 })).toBe(true);
    expect(hasExceededPointerDragThreshold(startPoint, { x: 103, y: 103 })).toBe(true);
  });

  it('converts normal image, scaled, and canvas coordinates', () => {
    const transform = {
      scale: 2,
      gridLimit: 10,
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
      offsetX: 5,
      offsetY: -3,
      canvasOffsetLeft: 22,
      canvasOffsetTop: 22,
    };
    const imagePoint = { x: 12, y: 8 };
    const canvasPoint = imageToCanvasPoint(imagePoint, transform);

    expect(canvasPoint).toEqual({ x: 159, y: 107 });
    expect(canvasToImagePoint(canvasPoint, transform)).toEqual(imagePoint);
    expect(scaledToCanvasPoint({ x: 120, y: 80 }, transform)).toEqual(canvasPoint);
  });

  it('uses one rendered pixel pitch for image bounds and visible source ranges', () => {
    expect(getRenderedPixelPitch(9.9)).toBe(9.9);
    expect(getRenderedPixelPitch(10)).toBe(11);
    expect(getRenderedImageSize(100, 10)).toBe(1100);

    expect(calculateVisibleImageAxis(100, 100, -110, 10)).toEqual({
      pixelPitch: 11,
      renderedSize: 1100,
      sourceStart: 10,
      sourceEnd: 19,
      sourceSize: 10,
      canvasStart: 0,
      canvasEnd: 110,
    });
    expect(calculateVisibleImageAxis(100, 100, -1100, 10)).toBeNull();
  });

  it('keeps the same image position under the pointer while crossing the grid threshold', () => {
    const pointerPosition = 250;
    const currentOffset = -120;
    const imagePosition = (pointerPosition - currentOffset) / getRenderedPixelPitch(9.9);
    const nextOffset = calculatePointerAnchoredOffset(pointerPosition, currentOffset, 9.9, 10);

    expect((pointerPosition - nextOffset) / getRenderedPixelPitch(10)).toBeCloseTo(imagePosition);
  });

  it('fits images using rendered grid spacing without changing the intended scale modes', () => {
    expect(calculateFitScale({ width: 1000, height: 500 }, { width: 1000, height: 800 })).toBe(1);
    expect(calculateFitScale({ width: 50, height: 50 }, { width: 550, height: 550 })).toBe(10);
    expect(calculateFitScale({ width: 50, height: 50 }, { width: 525, height: 525 })).toBe(9.9);
  });

  it('centers the rendered Quad pixels and fits their context into 75 percent of the viewport', () => {
    const quad = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 50 },
      { x: 0, y: 50 },
    ];
    const result = calculateQuadFocusTransform(quad, {
      viewportWidth: 1000,
      viewportHeight: 800,
      imageWidth: 2000,
      imageHeight: 1000,
    });
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
    const result = calculateQuadFocusTransform(quad, {
      viewportWidth: 1000,
      viewportHeight: 800,
      imageWidth: 2000,
      imageHeight: 1000,
    });
    const outerBounds = getFocusedOuterQuadBounds(quad, result);
    const focusPixelCount = result.focusBounds.bottom - result.focusBounds.top;
    const visualFocusHeight = focusPixelCount * (result.scale + 1) - 1;

    expect(result.scale).toBeGreaterThanOrEqual(10);
    expect(Math.abs(visualFocusHeight - 800 * 0.75)).toBeLessThanOrEqual(1);
    expect(Math.abs((outerBounds.left + outerBounds.right) / 2 - 500)).toBeLessThanOrEqual(1);
    expect(Math.abs((outerBounds.top + outerBounds.bottom) / 2 - 400)).toBeLessThanOrEqual(1);
  });

  it('raises a large off-center Quad to the image fit scale without losing the Quad', () => {
    const quad = createRectQuad(90, 10, 989, 489);
    const result = calculateQuadFocusTransform(quad, {
      viewportWidth: 1000,
      viewportHeight: 800,
      imageWidth: 1000,
      imageHeight: 500,
    });

    expect(result.scale).toBe(1);
    expect(getRenderedImageSize(1000, result.scale)).toBe(1000);
    expectVisibleFocusedQuad(quad, result, 1000, 800);
    expect(result.offsetX).not.toBe(0); // Quad-centered, not image-centered.
  });

  it.each([
    ['full-image', createRectQuad(0, 0, 999, 799)],
    ['beyond the left edge', createRectQuad(-200, 10, 799, 700)],
    ['very wide', createRectQuad(-600, 100, 1599, 299)],
    ['very tall', createRectQuad(100, -600, 299, 1599)],
    ['beyond all image edges', createRectQuad(-100, -100, 1099, 899)],
    ['larger than the usual minimum scale permits', createRectQuad(-10000, -10000, 19999, 19999)],
  ])('keeps a %s Quad fully visible even when the image fit scale would crop it', (_, quad) => {
    const result = calculateQuadFocusTransform(quad, {
      viewportWidth: 1000,
      viewportHeight: 800,
      imageWidth: 1000,
      imageHeight: 800,
    });

    expect(result.scale).toBeGreaterThan(0);
    expect(result.scale).toBeLessThan(1);
    expectVisibleFocusedQuad(quad, result, 1000, 800);
    const bounds = getFocusedOuterQuadBounds(quad, result);
    expect(Math.min(bounds.left, bounds.top)).toBeCloseTo(16);
  });

  it.each([
    [9.9, 9.9],
    [10, 9.9],
    [10.5, 9.9],
    [11, 10],
    [11.5, 10.5],
  ])('fits the whole Quad when the available pixel pitch is %s', (availablePitch, expectedScale) => {
    const quad = createRectQuad(-10, -10, 39, 39);
    const viewportSize = 50 * availablePitch + 32;
    const result = calculateQuadFocusTransform(quad, {
      viewportWidth: viewportSize,
      viewportHeight: viewportSize,
      imageWidth: 20,
      imageHeight: 20,
    });

    expect(result.scale).toBeCloseTo(expectedScale);
    expectVisibleFocusedQuad(quad, result, viewportSize, viewportSize);
  });

  it('rounds the image-size floor up across the grid gap when the Quad still fits', () => {
    const quad = createRectQuad(10, 10, 39, 39);
    const result = calculateQuadFocusTransform(quad, {
      viewportWidth: 525,
      viewportHeight: 525,
      imageWidth: 50,
      imageHeight: 50,
    });

    expect(result.scale).toBe(10);
    expect(getRenderedImageSize(50, result.scale)).toBeGreaterThanOrEqual(525);
    expectVisibleFocusedQuad(quad, result, 525, 525);
  });

  it('reduces screen padding in a tiny viewport and keeps the upper zoom limit', () => {
    const quad = createRectQuad(-50, -50, 49, 49);
    const result = calculateQuadFocusTransform(quad, {
      viewportWidth: 20,
      viewportHeight: 12,
      imageWidth: 100,
      imageHeight: 100,
    });
    expect(result.scale).toBeCloseTo(0.06);
    expectVisibleFocusedQuad(quad, result, 20, 12, 3);

    const tinyQuad = createRectQuad(0, 0, 1, 1);
    const cappedResult = calculateQuadFocusTransform(tinyQuad, {
      viewportWidth: 10000,
      viewportHeight: 10000,
      imageWidth: 2,
      imageHeight: 2,
    });
    expect(cappedResult.scale).toBe(60);
    expectVisibleFocusedQuad(tinyQuad, cappedResult, 10000, 10000);
  });

  it('centers one rendered pixel at the standard local editing scale', () => {
    const imagePoint = { x: 123, y: 45 };
    const result = calculatePixelFocusTransform(imagePoint, { viewportWidth: 1000, viewportHeight: 800 });
    const coordinateTransform = {
      scale: result.scale,
      gridLimit: 10,
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
    const dimensions = { viewportWidth: 1000, viewportHeight: 800, imageWidth: 1000, imageHeight: 800 };
    expect(calculateQuadFocusTransform([], dimensions)).toBeNull();
    expect(
      calculateQuadFocusTransform(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: Number.NaN },
          { x: 0, y: 1 },
        ],
        dimensions,
      ),
    ).toBeNull();
    for (const key of Object.keys(dimensions)) {
      expect(calculateQuadFocusTransform(createRectQuad(0, 0, 10, 10), { ...dimensions, [key]: 0 })).toBeNull();
    }
    expect(
      calculateQuadFocusTransform(createRectQuad(-Number.MAX_VALUE, 0, Number.MAX_VALUE, 10), dimensions),
    ).toBeNull();
    expect(
      calculatePixelFocusTransform({ x: Number.NaN, y: 0 }, { viewportWidth: 1000, viewportHeight: 800 }),
    ).toBeNull();
  });
});

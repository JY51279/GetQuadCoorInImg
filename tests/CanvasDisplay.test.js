import { describe, expect, it } from 'vitest';
import { getCanvasBackingLength, normalizeDevicePixelRatio } from '../src/renderer/src/utils/CanvasDisplay.js';

describe('Canvas display sizing', () => {
  it('normalizes invalid device pixel ratios', () => {
    expect(normalizeDevicePixelRatio(1.5)).toBe(1.5);
    expect(normalizeDevicePixelRatio(0)).toBe(1);
    expect(normalizeDevicePixelRatio(Number.NaN)).toBe(1);
  });

  it('calculates the backing length from CSS pixels and the current display ratio', () => {
    expect(getCanvasBackingLength(201, 1.25)).toBe(251);
    expect(getCanvasBackingLength(120, 1.5)).toBe(180);
    expect(getCanvasBackingLength(0, 2)).toBe(0);
  });
});

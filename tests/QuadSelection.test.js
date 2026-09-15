import { describe, expect, it } from 'vitest';
import {
  INACTIVE_QUAD_INDEX,
  getAdjacentQuadIndex,
  normalizeQuadIndex,
} from '../src/renderer/src/state/QuadSelection.js';

describe('Quad selection state', () => {
  it('normalizes invalid and out-of-range indices to the inactive state', () => {
    expect(normalizeQuadIndex(0, 3)).toBe(0);
    expect(normalizeQuadIndex(2, 3)).toBe(2);
    expect(normalizeQuadIndex(-1, 3)).toBe(INACTIVE_QUAD_INDEX);
    expect(normalizeQuadIndex(3, 3)).toBe(INACTIVE_QUAD_INDEX);
    expect(normalizeQuadIndex(0, 0)).toBe(INACTIVE_QUAD_INDEX);
  });

  it('moves backward through the inactive state before re-entering at the maximum index', () => {
    expect(getAdjacentQuadIndex({ activeIndex: 2, quadCount: 3, direction: 'previous' })).toBe(1);
    expect(getAdjacentQuadIndex({ activeIndex: 1, quadCount: 3, direction: 'previous' })).toBe(0);
    expect(getAdjacentQuadIndex({ activeIndex: 0, quadCount: 3, direction: 'previous' })).toBe(INACTIVE_QUAD_INDEX);
    expect(getAdjacentQuadIndex({ activeIndex: INACTIVE_QUAD_INDEX, quadCount: 3, direction: 'previous' })).toBe(2);
  });

  it('moves forward through the inactive state before re-entering at the minimum index', () => {
    expect(getAdjacentQuadIndex({ activeIndex: 0, quadCount: 3, direction: 'next' })).toBe(1);
    expect(getAdjacentQuadIndex({ activeIndex: 1, quadCount: 3, direction: 'next' })).toBe(2);
    expect(getAdjacentQuadIndex({ activeIndex: 2, quadCount: 3, direction: 'next' })).toBe(INACTIVE_QUAD_INDEX);
    expect(getAdjacentQuadIndex({ activeIndex: INACTIVE_QUAD_INDEX, quadCount: 3, direction: 'next' })).toBe(0);
  });

  it('supports one or zero Quads without special caller logic', () => {
    expect(getAdjacentQuadIndex({ activeIndex: 0, quadCount: 1, direction: 'previous' })).toBe(INACTIVE_QUAD_INDEX);
    expect(getAdjacentQuadIndex({ activeIndex: INACTIVE_QUAD_INDEX, quadCount: 1, direction: 'previous' })).toBe(0);
    expect(getAdjacentQuadIndex({ activeIndex: 0, quadCount: 1, direction: 'next' })).toBe(INACTIVE_QUAD_INDEX);
    expect(getAdjacentQuadIndex({ activeIndex: INACTIVE_QUAD_INDEX, quadCount: 1, direction: 'next' })).toBe(0);
    expect(getAdjacentQuadIndex({ activeIndex: 0, quadCount: 0, direction: 'next' })).toBe(INACTIVE_QUAD_INDEX);
  });

  it('treats any invalid current index as inactive and ignores an unknown direction', () => {
    expect(getAdjacentQuadIndex({ activeIndex: 99, quadCount: 3, direction: 'previous' })).toBe(2);
    expect(getAdjacentQuadIndex({ activeIndex: 99, quadCount: 3, direction: 'next' })).toBe(0);
    expect(getAdjacentQuadIndex({ activeIndex: 1, quadCount: 3, direction: 'unknown' })).toBe(1);
  });
});

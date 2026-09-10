import { describe, expect, it } from 'vitest';
import {
  getQuadCenterPoint,
  isPointInQuad,
  sortQuadPointsClockwise,
} from '../src/renderer/src/utils/QuadGeometry.js';

describe('Quad geometry', () => {
  it('sorts a Quad from its top-left point in clockwise screen order', () => {
    const points = [
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];

    expect(sortQuadPointsClockwise(points)).toBe(true);
    expect(points).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ]);
  });

  it('keeps the first DataMatrix point fixed while sorting the remaining points', () => {
    const points = [
      { x: 10, y: 10 },
      { x: 5, y: 10 },
      { x: 20, y: 20 },
      { x: 10, y: 20 },
    ];

    expect(sortQuadPointsClockwise(points, 'datamatrix')).toBe(true);
    expect(points[0]).toEqual({ x: 10, y: 10 });
  });

  it('calculates the center and hit-tests without mutating the supplied Quad', () => {
    const points = [
      { x: 10, y: 10 },
      { x: 0, y: 10 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ];
    const snapshot = points.map(point => ({ ...point }));

    expect(getQuadCenterPoint(points)).toEqual({ x: 5, y: 5 });
    expect(isPointInQuad({ x: 5, y: 5 }, points)).toBe(true);
    expect(isPointInQuad({ x: 0, y: 5 }, points)).toBe(false);
    expect(points).toEqual(snapshot);
  });
});

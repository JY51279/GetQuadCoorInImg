import { describe, expect, it } from 'vitest';
import {
  getQuadCenterPoint,
  isPointInQuad,
  prepareQuad,
  prepareQuadPointUpdate,
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

  it('completes two diagonal points into a validated rectangle without mutating the input', () => {
    const points = [
      { x: 20, y: 10 },
      { x: 40, y: 30 },
    ];

    expect(prepareQuad(points)).toEqual({
      success: true,
      points: [
        { x: 20, y: 10 },
        { x: 40, y: 10 },
        { x: 40, y: 30 },
        { x: 20, y: 30 },
      ],
    });
    expect(points).toEqual([
      { x: 20, y: 10 },
      { x: 40, y: 30 },
    ]);
  });

  it('completes three consecutive points into a validated parallelogram', () => {
    expect(
      prepareQuad([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 12, y: 8 },
      ]),
    ).toEqual({
      success: true,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 12, y: 8 },
        { x: 2, y: 8 },
      ],
    });
  });

  it('rejects degenerate, duplicate, collinear, and concave Quad inputs', () => {
    expect(
      prepareQuad([
        { x: 10, y: 10 },
        { x: 10, y: 30 },
      ]),
    ).toMatchObject({ success: false, error: 'A Quad must contain four distinct points.' });
    expect(
      prepareQuad([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 10, y: 10 },
      ]),
    ).toMatchObject({ success: false, error: 'A Quad must contain four distinct points.' });
    expect(
      prepareQuad([
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toMatchObject({ success: false, error: 'A Quad cannot contain three collinear points.' });
    expect(
      prepareQuad([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 3, y: 3 },
        { x: 0, y: 10 },
      ]),
    ).toMatchObject({
      success: false,
      error: 'A Quad must remain convex and cannot contain crossing edges.',
    });
  });

  it('uses the same validation pipeline for direct point updates and DataMatrix ordering', () => {
    const points = [
      { x: 10, y: 10 },
      { x: 20, y: 10 },
      { x: 20, y: 20 },
      { x: 10, y: 20 },
    ];

    const prepared = prepareQuadPointUpdate(points, 1, { x: 5, y: 10 }, 'DataMatrix');
    expect(prepared.success).toBe(true);
    expect(prepared.points[0]).toEqual({ x: 10, y: 10 });
    expect(points[1]).toEqual({ x: 20, y: 10 });

    expect(prepareQuadPointUpdate(points, 1, { x: 10, y: 10 })).toMatchObject({
      success: false,
      error: 'A Quad must contain four distinct points.',
    });
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

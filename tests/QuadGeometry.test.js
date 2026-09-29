import { describe, expect, it } from 'vitest';
import {
  QUAD_TRANSLATION_TARGET,
  calculateQuadTranslation,
  getQuadCenterPoint,
  isPointInQuad,
  prepareQuad,
  prepareQuadPointUpdate,
  sortQuadPointsClockwise,
} from '../src/renderer/src/utils/QuadGeometry.js';

describe('Quad geometry', () => {
  it('translates every Quad point by the full requested delta beyond image boundaries', () => {
    const points = [
      { x: 2, y: 3 },
      { x: 8, y: 3 },
      { x: 8, y: 9 },
      { x: 2, y: 9 },
    ];

    const result = calculateQuadTranslation(points, { x: 20, y: -10 });
    expect(result).toEqual({
      points: [
        { x: 22, y: -7 },
        { x: 28, y: -7 },
        { x: 28, y: -1 },
        { x: 22, y: -1 },
      ],
      delta: { x: 20, y: -10 },
      clamped: false,
    });
    expect(calculateQuadTranslation(result.points, { x: -20, y: 10 }).points).toEqual(points);
    expect(points[0]).toEqual({ x: 2, y: 3 });
  });

  it('translates only the selected edge endpoints by one shared delta', () => {
    const points = [
      { x: 2, y: 3 },
      { x: 8, y: 3 },
      { x: 8, y: 9 },
      { x: 2, y: 9 },
    ];

    expect(
      calculateQuadTranslation(
        points,
        { x: 4, y: 2 },
        {
          type: QUAD_TRANSLATION_TARGET.EDGE,
          edgeIndex: 0,
        },
      ),
    ).toEqual({
      points: [
        { x: 6, y: 5 },
        { x: 12, y: 5 },
        { x: 8, y: 9 },
        { x: 2, y: 9 },
      ],
      delta: { x: 4, y: 2 },
      clamped: false,
    });
  });

  it('stops edge translation at the last valid convex position', () => {
    const points = [
      { x: 2, y: 3 },
      { x: 8, y: 3 },
      { x: 8, y: 9 },
      { x: 2, y: 9 },
    ];

    expect(
      calculateQuadTranslation(
        points,
        { x: 0, y: 20 },
        {
          type: QUAD_TRANSLATION_TARGET.EDGE,
          edgeIndex: 0,
        },
      ),
    ).toEqual({
      points: [
        { x: 2, y: 8 },
        { x: 8, y: 8 },
        { x: 8, y: 9 },
        { x: 2, y: 9 },
      ],
      delta: { x: 0, y: 5 },
      clamped: true,
    });
  });

  it('moves an already out-of-bounds edge further outward while keeping the other vertices fixed', () => {
    const points = [
      { x: -5, y: -5 },
      { x: 15, y: -5 },
      { x: 15, y: 15 },
      { x: -5, y: 15 },
    ];
    expect(calculateQuadTranslation(points, { x: -10, y: -20 }, { type: 'edge', edgeIndex: 0 })).toEqual({
      points: [
        { x: -15, y: -25 },
        { x: 5, y: -25 },
        { x: 15, y: 15 },
        { x: -5, y: 15 },
      ],
      delta: { x: -10, y: -20 },
      clamped: false,
    });
  });

  it('rejects translations whose resulting coordinates exceed the safe integer range', () => {
    const maximum = Number.MAX_SAFE_INTEGER;
    const points = [
      { x: maximum - 10, y: 0 },
      { x: maximum, y: 0 },
      { x: maximum, y: 10 },
      { x: maximum - 10, y: 10 },
    ];
    expect(calculateQuadTranslation(points, { x: 1, y: 0 })).toBeNull();
    expect(calculateQuadTranslation(points, { x: 1, y: 0 }, { type: 'edge', edgeIndex: 1 })).toBeNull();
  });

  it('rejects edge translation of a degenerate imported Quad', () => {
    const points = [
      { x: -10, y: 0 },
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 20, y: 0 },
    ];
    expect(calculateQuadTranslation(points, { x: 0, y: -5 }, { type: 'edge', edgeIndex: 0 })).toBeNull();
  });

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
    ).toMatchObject({ success: false, error: 'Quad 必须包含四个不同的点。' });
    expect(
      prepareQuad([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 10, y: 10 },
      ]),
    ).toMatchObject({ success: false, error: 'Quad 必须包含四个不同的点。' });
    expect(
      prepareQuad([
        { x: 0, y: 0 },
        { x: 3, y: 0 },
        { x: 10, y: 0 },
      ]),
    ).toMatchObject({ success: false, error: 'Quad 不能包含三个共线点。' });
    expect(
      prepareQuad([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 3, y: 3 },
        { x: 0, y: 10 },
      ]),
    ).toMatchObject({
      success: false,
      error: 'Quad 必须保持凸四边形，且边不能交叉。',
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
      error: 'Quad 必须包含四个不同的点。',
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

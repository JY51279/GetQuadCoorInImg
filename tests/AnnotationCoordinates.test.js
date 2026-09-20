import { describe, expect, it } from 'vitest';
import {
  datasetPointToImagePoint,
  imagePointToDatasetPoint,
  imageDeltaToDatasetDelta,
  normalizeCoordinateScale,
} from '../src/renderer/src/utils/AnnotationCoordinates.js';

describe('Annotation coordinate mapping', () => {
  it.each([0.2, 0.4, 2])('rounds opposite translation vectors symmetrically at scale %s', scale => {
    const positive = imageDeltaToDatasetDelta({ x: 1, y: 1 }, scale);
    const negative = imageDeltaToDatasetDelta({ x: -1, y: -1 }, scale);
    expect(positive).toEqual({ x: Math.round(1 / scale), y: Math.round(1 / scale) });
    expect(negative).toEqual({ x: -positive.x, y: -positive.y });
  });

  it('supports independent delta scales, normalizes negative zero and rejects unsafe coordinates', () => {
    expect(imageDeltaToDatasetDelta({ x: -1, y: 1 }, { x: 0.4, y: 0.2 })).toEqual({ x: -3, y: 5 });
    expect(imageDeltaToDatasetDelta({ x: -0.1, y: -0 }, 1)).toEqual({ x: 0, y: 0 });
    expect(imageDeltaToDatasetDelta({ x: 1, y: 0 }, 0)).toBeNull();
    expect(imageDeltaToDatasetDelta({ x: Infinity, y: 0 }, 1)).toBeNull();
    expect(imageDeltaToDatasetDelta({ x: Number.MAX_SAFE_INTEGER, y: 0 }, 0.1)).toBeNull();
    expect(imagePointToDatasetPoint({ x: -1, y: 0 }, 0.4)).toEqual({ x: -2, y: 0 });
  });

  it('maps points with independent horizontal and vertical scales', () => {
    expect(datasetPointToImagePoint({ x: 10, y: 8 }, { x: 0.5, y: 0.25 })).toEqual({ x: 5, y: 2 });
    expect(imagePointToDatasetPoint({ x: 5, y: 2 }, { x: 0.5, y: 0.25 })).toEqual({ x: 10, y: 8 });
  });

  it('rejects non-invertible coordinate scales and invalid input', () => {
    expect(imagePointToDatasetPoint({ x: 0, y: 4 }, { x: 0, y: 0.5 })).toBeNull();
    expect(datasetPointToImagePoint({ x: 0, y: 4 }, { x: 0, y: 0.5 })).toBeNull();
    expect(normalizeCoordinateScale({ x: 0, y: 1 })).toBeNull();
    expect(normalizeCoordinateScale({ x: -1, y: 1 })).toBeNull();
    expect(datasetPointToImagePoint({ x: Number.NaN, y: 1 }, 1)).toBeNull();
  });
});

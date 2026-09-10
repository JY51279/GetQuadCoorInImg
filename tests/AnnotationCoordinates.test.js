import { describe, expect, it } from 'vitest';
import {
  datasetPointToImagePoint,
  imagePointToDatasetPoint,
  normalizeCoordinateScale,
} from '../src/renderer/src/utils/AnnotationCoordinates.js';

describe('Annotation coordinate mapping', () => {
  it('maps points with independent horizontal and vertical scales', () => {
    expect(datasetPointToImagePoint({ x: 10, y: 8 }, { x: 0.5, y: 0.25 })).toEqual({ x: 5, y: 2 });
    expect(imagePointToDatasetPoint({ x: 5, y: 2 }, { x: 0.5, y: 0.25 })).toEqual({ x: 10, y: 8 });
  });

  it('supports endpoint-collapsed dimensions and rejects invalid input', () => {
    expect(imagePointToDatasetPoint({ x: 0, y: 4 }, { x: 0, y: 0.5 })).toEqual({ x: 0, y: 8 });
    expect(normalizeCoordinateScale({ x: -1, y: 1 })).toBeNull();
    expect(datasetPointToImagePoint({ x: Number.NaN, y: 1 }, 1)).toBeNull();
  });
});

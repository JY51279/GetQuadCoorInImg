import { describe, expect, it } from 'vitest';
import {
  VIEWPORT_MODE,
  VIEWPORT_MODE_EVENT,
  isQuadFocusMode,
  resolveFocusModeQuadIndex,
  transitionViewportMode,
} from '../src/renderer/src/state/QuadFocusMode.js';

describe('Quad focus mode', () => {
  it('toggles focus mode explicitly and resets it for a new dataset', () => {
    expect(transitionViewportMode(VIEWPORT_MODE.FREE, VIEWPORT_MODE_EVENT.TOGGLE_QUAD_FOCUS)).toBe(
      VIEWPORT_MODE.FOCUS_QUAD,
    );
    expect(transitionViewportMode(VIEWPORT_MODE.FOCUS_QUAD, VIEWPORT_MODE_EVENT.TOGGLE_QUAD_FOCUS)).toBe(
      VIEWPORT_MODE.FREE,
    );
    expect(transitionViewportMode(VIEWPORT_MODE.FOCUS_QUAD, VIEWPORT_MODE_EVENT.DATASET_CHANGED)).toBe(
      VIEWPORT_MODE.FREE,
    );
    expect(isQuadFocusMode(VIEWPORT_MODE.FOCUS_QUAD)).toBe(true);
    expect(isQuadFocusMode(VIEWPORT_MODE.FREE)).toBe(false);
  });

  it('keeps a valid active Quad when focus mode is entered', () => {
    expect(resolveFocusModeQuadIndex({ activeIndex: 2, quadCount: 4 })).toBe(2);
  });

  it('uses the first Quad when no valid Quad is active', () => {
    expect(resolveFocusModeQuadIndex({ activeIndex: -1, quadCount: 4 })).toBe(0);
    expect(resolveFocusModeQuadIndex({ activeIndex: 99, quadCount: 4 })).toBe(0);
  });

  it('keeps the inactive index when the image has no Quad', () => {
    expect(resolveFocusModeQuadIndex({ activeIndex: -1, quadCount: 0 })).toBe(-1);
    expect(resolveFocusModeQuadIndex({ activeIndex: 0, quadCount: 0 })).toBe(-1);
  });
});

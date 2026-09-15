import { describe, expect, it } from 'vitest';
import {
  QUAD_INTERACTION_MODE,
  getQuadInteractionCapabilities,
  isDirectQuadEditingMode,
  toggleQuadInteractionMode,
} from '../src/renderer/src/state/QuadInteractionMode.js';

describe('Quad interaction mode', () => {
  it('uses observation and point-selection behavior by default', () => {
    expect(getQuadInteractionCapabilities(QUAD_INTERACTION_MODE.DEFAULT)).toEqual({
      hoverActivation: false,
      pointDrag: false,
      wholeQuadDrag: false,
      edgeDrag: false,
    });
    expect(isDirectQuadEditingMode(QUAD_INTERACTION_MODE.DEFAULT)).toBe(false);
  });

  it('enables every current direct-edit capability in direct mode', () => {
    expect(getQuadInteractionCapabilities(QUAD_INTERACTION_MODE.DIRECT_EDIT)).toEqual({
      hoverActivation: true,
      pointDrag: true,
      wholeQuadDrag: true,
      edgeDrag: true,
    });
    expect(isDirectQuadEditingMode(QUAD_INTERACTION_MODE.DIRECT_EDIT)).toBe(true);
  });

  it('toggles between the two modes and treats unknown state as the safe default', () => {
    expect(toggleQuadInteractionMode(QUAD_INTERACTION_MODE.DEFAULT)).toBe(QUAD_INTERACTION_MODE.DIRECT_EDIT);
    expect(toggleQuadInteractionMode(QUAD_INTERACTION_MODE.DIRECT_EDIT)).toBe(QUAD_INTERACTION_MODE.DEFAULT);
    expect(getQuadInteractionCapabilities('unknown')).toBe(
      getQuadInteractionCapabilities(QUAD_INTERACTION_MODE.DEFAULT),
    );
  });
});

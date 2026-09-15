import { INACTIVE_QUAD_INDEX, normalizeQuadIndex } from './QuadSelection.js';

export const VIEWPORT_MODE = Object.freeze({
  FREE: 'free',
  FOCUS_QUAD: 'focus-quad',
});

export const VIEWPORT_MODE_EVENT = Object.freeze({
  TOGGLE_QUAD_FOCUS: 'toggle-quad-focus',
  DATASET_CHANGED: 'dataset-changed',
});

const MODE_TRANSITIONS = Object.freeze({
  [VIEWPORT_MODE.FREE]: Object.freeze({
    [VIEWPORT_MODE_EVENT.TOGGLE_QUAD_FOCUS]: VIEWPORT_MODE.FOCUS_QUAD,
    [VIEWPORT_MODE_EVENT.DATASET_CHANGED]: VIEWPORT_MODE.FREE,
  }),
  [VIEWPORT_MODE.FOCUS_QUAD]: Object.freeze({
    [VIEWPORT_MODE_EVENT.TOGGLE_QUAD_FOCUS]: VIEWPORT_MODE.FREE,
    [VIEWPORT_MODE_EVENT.DATASET_CHANGED]: VIEWPORT_MODE.FREE,
  }),
});

export function transitionViewportMode(mode, event) {
  const normalizedMode = MODE_TRANSITIONS[mode] ? mode : VIEWPORT_MODE.FREE;
  return MODE_TRANSITIONS[normalizedMode][event] ?? normalizedMode;
}

export function isQuadFocusMode(mode) {
  return mode === VIEWPORT_MODE.FOCUS_QUAD;
}

export function resolveFocusModeQuadIndex({ activeIndex, quadCount } = {}) {
  const normalizedIndex = normalizeQuadIndex(activeIndex, quadCount);
  if (normalizedIndex !== INACTIVE_QUAD_INDEX) return normalizedIndex;
  return Number.isInteger(quadCount) && quadCount > 0 ? 0 : INACTIVE_QUAD_INDEX;
}

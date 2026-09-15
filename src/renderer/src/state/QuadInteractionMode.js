export const QUAD_INTERACTION_MODE = Object.freeze({
  DEFAULT: 'default',
  DIRECT_EDIT: 'direct-edit',
});

const DEFAULT_CAPABILITIES = Object.freeze({
  hoverActivation: false,
  pointDrag: false,
  wholeQuadDrag: false,
  edgeDrag: false,
});

const DIRECT_EDIT_CAPABILITIES = Object.freeze({
  hoverActivation: true,
  pointDrag: true,
  wholeQuadDrag: true,
  edgeDrag: true,
});

const MODE_CAPABILITIES = Object.freeze({
  [QUAD_INTERACTION_MODE.DEFAULT]: DEFAULT_CAPABILITIES,
  [QUAD_INTERACTION_MODE.DIRECT_EDIT]: DIRECT_EDIT_CAPABILITIES,
});

export function getQuadInteractionCapabilities(mode) {
  return MODE_CAPABILITIES[mode] ?? DEFAULT_CAPABILITIES;
}

export function toggleQuadInteractionMode(mode) {
  return mode === QUAD_INTERACTION_MODE.DIRECT_EDIT ? QUAD_INTERACTION_MODE.DEFAULT : QUAD_INTERACTION_MODE.DIRECT_EDIT;
}

export function isDirectQuadEditingMode(mode) {
  return mode === QUAD_INTERACTION_MODE.DIRECT_EDIT;
}

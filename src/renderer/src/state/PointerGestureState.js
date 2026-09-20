export const POINTER_PHASE = Object.freeze({ IDLE: 'idle', PRESSED: 'pressed', DRAGGING: 'dragging' });

export function createPointerGestureState() {
  return { phase: POINTER_PHASE.IDLE, pointerId: null };
}

export function matchesGesturePointer(state, event) {
  return state.phase !== POINTER_PHASE.IDLE && state.pointerId === event?.pointerId;
}

// Pure lifecycle rules; pointer capture, preview and persistence stay with callers.
export function transitionPointerGesture(state, event) {
  if (event.type === 'start') {
    if (state.phase !== POINTER_PHASE.IDLE || !Number.isInteger(event.pointerId)) return state;
    return { phase: event.immediate ? POINTER_PHASE.DRAGGING : POINTER_PHASE.PRESSED, pointerId: event.pointerId };
  }
  if (!matchesGesturePointer(state, event)) return state;
  if (event.type === 'drag') return { phase: POINTER_PHASE.DRAGGING, pointerId: state.pointerId };
  if (event.type === 'finish' || event.type === 'cancel') return createPointerGestureState();
  return state;
}

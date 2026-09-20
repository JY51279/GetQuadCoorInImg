import { reactive } from 'vue';
import { hasExceededPointerDragThreshold } from '../utils/ImageViewGeometry.js';
import { capturePointer, releasePointer } from '../utils/PointerCapture.js';
import {
  POINTER_PHASE,
  createPointerGestureState,
  matchesGesturePointer,
  transitionPointerGesture,
} from '../state/PointerGestureState.js';

export function useCanvasPanGesture({
  dragThreshold = 4,
  canStart = () => true,
  canContinue = () => true,
  onGestureStart = () => {},
  onDrag = () => {},
  onGestureEnd = () => {},
} = {}) {
  const state = reactive({
    ...createPointerGestureState(),
    get active() {
      return this.phase !== POINTER_PHASE.IDLE;
    },
    suppressClick: false,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
  });
  let captureElement = null;
  const validPoint = event => Number.isFinite(event?.clientX) && Number.isFinite(event?.clientY);

  function start(event) {
    if (state.active || event?.button !== 0 || !validPoint(event) || !canStart(event)) return false;
    const next = transitionPointerGesture(state, { type: 'start', pointerId: event.pointerId });
    if (next === state) return false;
    Object.assign(state, next, {
      suppressClick: false,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
    });
    // Capture from press, on the original target so a canvas click is not retargeted to its container.
    captureElement = event.target?.setPointerCapture ? event.target : event.currentTarget;
    if (!capturePointer(captureElement, event.pointerId)) {
      reset({ canceled: true });
      return false;
    }
    onGestureStart({ x: event.clientX, y: event.clientY, event });
    return true;
  }

  function move(event) {
    if (!matchesGesturePointer(state, event)) return false;
    if (!canContinue(event) || !validPoint(event)) {
      cancel();
      return false;
    }
    let previousX = state.lastX;
    let previousY = state.lastY;
    const startedDragging = state.phase === POINTER_PHASE.PRESSED;
    if (startedDragging) {
      if (
        !hasExceededPointerDragThreshold(
          { x: state.startX, y: state.startY },
          { x: event.clientX, y: event.clientY },
          dragThreshold,
        )
      )
        return false;
      Object.assign(state, transitionPointerGesture(state, { type: 'drag', pointerId: event.pointerId }));
      state.suppressClick = true;
      previousX = state.startX;
      previousY = state.startY;
    }
    onDrag({ previousX, previousY, currentX: event.clientX, currentY: event.clientY, startedDragging, event });
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    return true;
  }

  function reset({ preserveDragResult = true, releaseCapture = true, canceled = false } = {}) {
    const wasActive = state.active;
    const pointerId = state.pointerId;
    const dragged = state.phase === POINTER_PHASE.DRAGGING;
    const element = captureElement;
    const next = transitionPointerGesture(state, { type: canceled ? 'cancel' : 'finish', pointerId });
    if (next !== state) Object.assign(state, next);
    captureElement = null;
    if (!preserveDragResult) state.suppressClick = false;
    else if (canceled && wasActive) state.suppressClick = true;
    if (releaseCapture) releasePointer(element, pointerId);
    if (wasActive) onGestureEnd({ dragged, canceled });
  }

  function finish(event) {
    if (!matchesGesturePointer(state, event)) return false;
    move(event);
    if (!state.active) return false;
    reset();
    return true;
  }

  function cancel(event = null) {
    if (!state.active || (event && !matchesGesturePointer(state, event))) return false;
    reset({ canceled: true });
    return true;
  }

  function handleLostPointerCapture(event) {
    if (!matchesGesturePointer(state, event)) return false;
    reset({ releaseCapture: false, canceled: true });
    return true;
  }

  return { state, start, move, finish, cancel, handleLostPointerCapture, reset };
}

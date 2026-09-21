import { reactive } from 'vue';
import {
  POINTER_PHASE,
  createPointerGestureState,
  matchesGesturePointer,
  transitionPointerGesture,
} from '../state/PointerGestureState.js';
import { capturePointer, releasePointer } from '../utils/PointerCapture.js';
import { isValidQuadPoints } from './useQuadOverlay.js';

// Pointer ownership and preview rollback only; coordinates and rendering come from the view.
export function useQuadPointGesture({
  canStart,
  canContinue,
  getActiveQuadIndex,
  getQuad,
  getPointerImagePoint,
  setQuadPoint,
  redraw,
  onFinish,
  onCommit,
}) {
  const state = reactive({
    ...createPointerGestureState(),
    get active() {
      return this.phase !== POINTER_PHASE.IDLE;
    },
    quadIndex: -1,
    pointIndex: -1,
    originalPoint: null,
    currentPoint: null,
  });
  let captureElement = null;

  function reset() {
    const pointerId = state.pointerId;
    const previousCaptureElement = captureElement;
    captureElement = null;
    Object.assign(state, {
      ...createPointerGestureState(),
      quadIndex: -1,
      pointIndex: -1,
      originalPoint: null,
      currentPoint: null,
    });
    releasePointer(previousCaptureElement, pointerId);
  }

  function start(event, pointIndex) {
    if (!canStart() || state.active || !Number.isInteger(event.pointerId) || event.button !== 0) return;

    const quadIndex = getActiveQuadIndex();
    const quad = getQuad(quadIndex);
    if (!isValidQuadPoints(quad) || !Number.isInteger(pointIndex) || pointIndex < 0 || pointIndex >= 4) return;

    const originalPoint = { ...quad[pointIndex] };
    Object.assign(state, {
      ...transitionPointerGesture(state, { type: 'start', pointerId: event.pointerId, immediate: true }),
      quadIndex,
      pointIndex,
      originalPoint,
      currentPoint: { ...originalPoint },
    });
    captureElement = event.currentTarget;
    if (!capturePointer(captureElement, event.pointerId)) reset();
  }

  function move(event) {
    if (!matchesGesturePointer(state, event)) return false;
    if (!canContinue()) {
      cancel();
      return false;
    }
    const nextPoint = getPointerImagePoint(event);
    const quad = getQuad(state.quadIndex);
    if (nextPoint === null || !isValidQuadPoints(quad)) return false;
    if (nextPoint.x === state.currentPoint.x && nextPoint.y === state.currentPoint.y) return true;

    if (!setQuadPoint(state.quadIndex, state.pointIndex, nextPoint)) return false;
    state.currentPoint = { ...nextPoint };
    redraw();
    return true;
  }

  function finish(event) {
    if (!state.active || event.pointerId !== state.pointerId) return;
    if (!move(event)) {
      cancel();
      return;
    }

    const payload = {
      quadIndex: state.quadIndex,
      pointIndex: state.pointIndex,
      imagePoint: { ...state.currentPoint },
    };
    const changed = payload.imagePoint.x !== state.originalPoint.x || payload.imagePoint.y !== state.originalPoint.y;
    reset();
    onFinish();
    if (changed) onCommit(payload);
  }

  function cancel(event = null) {
    if (!state.active || (event && !matchesGesturePointer(state, event))) return;

    setQuadPoint(state.quadIndex, state.pointIndex, state.originalPoint);
    reset();
    redraw();
  }

  return { state, start, move, finish, cancel, reset };
}

import { reactive } from 'vue';
import {
  POINTER_PHASE,
  createPointerGestureState,
  matchesGesturePointer,
  transitionPointerGesture,
} from '../state/PointerGestureState.js';
import { capturePointer, releasePointer } from '../utils/PointerCapture.js';
import { calculateQuadTranslation, normalizeQuadTranslationTarget } from '../utils/QuadGeometry.js';

function createIdleState() {
  return {
    ...createPointerGestureState(),
    quadIndex: -1,
    target: null,
    startPoint: null,
    originalPoints: [],
    currentPoints: [],
    delta: { x: 0, y: 0 },
  };
}

export function useQuadTranslationGesture({
  canStart = () => false,
  canContinue = canStart,
  getQuad = () => null,
  getPointerImagePoint = () => null,
  previewQuad = () => false,
  onStart = () => {},
  onCommit = () => {},
  onCancel = () => {},
} = {}) {
  const state = reactive({
    ...createIdleState(),
    get active() {
      return this.phase !== POINTER_PHASE.IDLE;
    },
  });
  let captureElement = null;

  function releaseCapture(pointerId) {
    const element = captureElement;
    captureElement = null;
    releasePointer(element, pointerId);
  }

  function resetState() {
    Object.assign(state, createIdleState());
  }

  function start(event, quadIndex, target) {
    const normalizedTarget = normalizeQuadTranslationTarget(target);
    if (
      state.active ||
      normalizedTarget === null ||
      !canStart(normalizedTarget) ||
      event?.button !== 0 ||
      !Number.isInteger(event.pointerId) ||
      !Number.isInteger(quadIndex) ||
      quadIndex < 0
    ) {
      return false;
    }

    const sourceQuad = getQuad(quadIndex);
    const startPoint = getPointerImagePoint(event);
    const initialTranslation = calculateQuadTranslation(sourceQuad, { x: 0, y: 0 }, normalizedTarget);
    if (!Number.isFinite(startPoint?.x) || !Number.isFinite(startPoint?.y) || initialTranslation === null) return false;

    Object.assign(state, {
      ...transitionPointerGesture(state, { type: 'start', pointerId: event.pointerId, immediate: true }),
      quadIndex,
      target: normalizedTarget,
      startPoint: { ...startPoint },
      originalPoints: initialTranslation.points.map(point => ({ ...point })),
      currentPoints: initialTranslation.points.map(point => ({ ...point })),
      delta: { x: 0, y: 0 },
    });
    captureElement = event.currentTarget ?? null;
    if (!capturePointer(captureElement, event.pointerId)) {
      resetState();
      captureElement = null;
      return false;
    }
    onStart({ quadIndex, target: { ...normalizedTarget } });
    return true;
  }

  function move(event) {
    if (!matchesGesturePointer(state, event)) return false;

    if (!canContinue(state.target)) {
      cancel('interaction-disabled');
      return false;
    }
    const currentPoint = getPointerImagePoint(event);
    if (!Number.isFinite(currentPoint?.x) || !Number.isFinite(currentPoint?.y)) return false;
    const translation = calculateQuadTranslation(
      state.originalPoints,
      {
        x: currentPoint.x - state.startPoint.x,
        y: currentPoint.y - state.startPoint.y,
      },
      state.target,
    );
    if (translation === null) return false;
    if (translation.delta.x === state.delta.x && translation.delta.y === state.delta.y) return true;
    if (!previewQuad(state.quadIndex, translation.points)) return false;

    state.currentPoints = translation.points.map(point => ({ ...point }));
    state.delta = { ...translation.delta };
    return true;
  }

  function finish(event) {
    if (!matchesGesturePointer(state, event)) return false;
    if (!move(event)) {
      cancel('invalid-final-point');
      return false;
    }

    const payload = {
      quadIndex: state.quadIndex,
      target: { ...state.target },
      imageDelta: { ...state.delta },
      imagePoints: state.currentPoints.map(point => ({ ...point })),
    };
    const originalPoints = state.originalPoints.map(point => ({ ...point }));
    const changed = payload.imageDelta.x !== 0 || payload.imageDelta.y !== 0;
    const pointerId = state.pointerId;
    resetState();
    releaseCapture(pointerId);

    if (changed) onCommit(payload);
    else {
      previewQuad(payload.quadIndex, originalPoints);
      onCancel({ quadIndex: payload.quadIndex, target: payload.target, reason: 'unchanged' });
    }
    return true;
  }

  function cancel(reason = 'canceled', event = null) {
    if (!state.active || (event && !matchesGesturePointer(state, event))) return false;

    const quadIndex = state.quadIndex;
    const target = { ...state.target };
    const originalPoints = state.originalPoints.map(point => ({ ...point }));
    const pointerId = state.pointerId;
    resetState();
    releaseCapture(pointerId);
    previewQuad(quadIndex, originalPoints);
    onCancel({ quadIndex, target, reason });
    return true;
  }

  function handleLostPointerCapture(event) {
    if (state.active && event?.pointerId === state.pointerId) cancel('lost-pointer-capture');
  }

  return { state, start, move, finish, cancel, handleLostPointerCapture };
}

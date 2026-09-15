import { reactive } from 'vue';
import { calculateClampedQuadTranslation } from '../utils/QuadGeometry.js';

function createIdleState() {
  return {
    active: false,
    pointerId: null,
    quadIndex: -1,
    startPoint: null,
    originalPoints: [],
    currentPoints: [],
    delta: { x: 0, y: 0 },
  };
}

export function useQuadTranslationGesture({
  canStart = () => false,
  getQuad = () => null,
  getImageSize = () => null,
  getPointerImagePoint = () => null,
  previewQuad = () => false,
  onStart = () => {},
  onCommit = () => {},
  onCancel = () => {},
} = {}) {
  const state = reactive(createIdleState());
  let captureElement = null;

  function releaseCapture(pointerId) {
    if (captureElement?.hasPointerCapture?.(pointerId)) captureElement.releasePointerCapture(pointerId);
    captureElement = null;
  }

  function resetState() {
    Object.assign(state, createIdleState());
  }

  function start(event, quadIndex) {
    if (state.active || !canStart() || event?.button !== 0 || !Number.isInteger(quadIndex) || quadIndex < 0) {
      return false;
    }

    const sourceQuad = getQuad(quadIndex);
    const startPoint = getPointerImagePoint(event);
    const imageSize = getImageSize();
    const initialTranslation = calculateClampedQuadTranslation(sourceQuad, { x: 0, y: 0 }, imageSize);
    if (startPoint === null || initialTranslation === null) return false;

    Object.assign(state, {
      active: true,
      pointerId: event.pointerId,
      quadIndex,
      startPoint: { ...startPoint },
      originalPoints: initialTranslation.points.map(point => ({ ...point })),
      currentPoints: initialTranslation.points.map(point => ({ ...point })),
      delta: { x: 0, y: 0 },
    });
    captureElement = event.currentTarget ?? null;
    captureElement?.setPointerCapture?.(event.pointerId);
    onStart({ quadIndex });
    return true;
  }

  function move(event) {
    if (!state.active || event?.pointerId !== state.pointerId) return false;

    const currentPoint = getPointerImagePoint(event);
    if (currentPoint === null) return false;
    const translation = calculateClampedQuadTranslation(
      state.originalPoints,
      {
        x: currentPoint.x - state.startPoint.x,
        y: currentPoint.y - state.startPoint.y,
      },
      getImageSize(),
    );
    if (translation === null) return false;
    if (translation.delta.x === state.delta.x && translation.delta.y === state.delta.y) return true;
    if (!previewQuad(state.quadIndex, translation.points)) return false;

    state.currentPoints = translation.points.map(point => ({ ...point }));
    state.delta = { ...translation.delta };
    return true;
  }

  function finish(event) {
    if (!state.active || event?.pointerId !== state.pointerId) return false;
    move(event);

    const payload = {
      quadIndex: state.quadIndex,
      imageDelta: { ...state.delta },
      imagePoints: state.currentPoints.map(point => ({ ...point })),
    };
    const originalPoints = state.originalPoints.map(point => ({ ...point }));
    const changed = payload.imageDelta.x !== 0 || payload.imageDelta.y !== 0;
    releaseCapture(state.pointerId);
    resetState();

    if (changed) onCommit(payload);
    else {
      previewQuad(payload.quadIndex, originalPoints);
      onCancel({ quadIndex: payload.quadIndex, reason: 'unchanged' });
    }
    return true;
  }

  function cancel(reason = 'canceled') {
    if (!state.active) return false;

    const quadIndex = state.quadIndex;
    const originalPoints = state.originalPoints.map(point => ({ ...point }));
    previewQuad(quadIndex, originalPoints);
    releaseCapture(state.pointerId);
    resetState();
    onCancel({ quadIndex, reason });
    return true;
  }

  function handleLostPointerCapture(event) {
    if (state.active && event?.pointerId === state.pointerId) cancel('lost-pointer-capture');
  }

  return { state, start, move, finish, cancel, handleLostPointerCapture };
}

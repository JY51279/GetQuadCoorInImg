import { reactive } from 'vue';
import { hasExceededPointerDragThreshold } from '../utils/ImageViewGeometry.js';

export function useCanvasPanGesture({
  dragThreshold = 4,
  canStart = () => true,
  canContinue = () => true,
  onGestureStart = () => {},
  onDrag = () => {},
  onGestureEnd = () => {},
} = {}) {
  const state = reactive({
    active: false,
    dragging: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
  });
  let captureElement = null;

  function matchesActivePointer(event) {
    return state.active && event?.pointerId === state.pointerId;
  }

  function start(event) {
    if (state.active || event?.button !== 0 || !canStart(event)) return false;

    Object.assign(state, {
      active: true,
      dragging: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
    });
    captureElement = null;
    onGestureStart({ x: event.clientX, y: event.clientY, event });
    return true;
  }

  function move(event) {
    if (!matchesActivePointer(event) || !canContinue(event)) return false;

    let previousX = state.lastX;
    let previousY = state.lastY;
    let startedDragging = false;
    if (!state.dragging) {
      if (
        !hasExceededPointerDragThreshold(
          { x: state.startX, y: state.startY },
          { x: event.clientX, y: event.clientY },
          dragThreshold,
        )
      ) {
        return false;
      }

      state.dragging = true;
      startedDragging = true;
      previousX = state.startX;
      previousY = state.startY;
      captureElement = event.currentTarget ?? null;
      captureElement?.setPointerCapture?.(event.pointerId);
    }

    onDrag({
      previousX,
      previousY,
      currentX: event.clientX,
      currentY: event.clientY,
      startedDragging,
      event,
    });
    state.lastX = event.clientX;
    state.lastY = event.clientY;
    return true;
  }

  function reset({ preserveDragResult = true, releaseCapture = true, canceled = false } = {}) {
    const wasActive = state.active;
    const pointerId = state.pointerId;
    const dragged = state.dragging;
    const capturedElement = captureElement;

    state.active = false;
    state.pointerId = null;
    captureElement = null;
    if (!preserveDragResult) state.dragging = false;

    if (releaseCapture && capturedElement?.hasPointerCapture?.(pointerId)) {
      capturedElement.releasePointerCapture(pointerId);
    }
    if (wasActive) onGestureEnd({ dragged, canceled });
  }

  function finish(event) {
    if (!matchesActivePointer(event)) return false;
    move(event);
    reset();
    return true;
  }

  function cancel(event) {
    if (!matchesActivePointer(event)) return false;
    state.dragging = true;
    reset({ canceled: true });
    return true;
  }

  function handleLostPointerCapture(event) {
    if (!matchesActivePointer(event)) return false;
    reset({ releaseCapture: false, canceled: true });
    return true;
  }

  return {
    state,
    start,
    move,
    finish,
    cancel,
    handleLostPointerCapture,
    reset,
  };
}

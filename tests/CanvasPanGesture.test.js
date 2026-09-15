import { describe, expect, it, vi } from 'vitest';
import { useCanvasPanGesture } from '../src/renderer/src/composables/useCanvasPanGesture.js';

function createCaptureElement() {
  const capturedPointers = new Set();
  return {
    setPointerCapture: vi.fn(pointerId => capturedPointers.add(pointerId)),
    hasPointerCapture: vi.fn(pointerId => capturedPointers.has(pointerId)),
    releasePointerCapture: vi.fn(pointerId => capturedPointers.delete(pointerId)),
  };
}

function createPointerEvent(pointerId, clientX, clientY, currentTarget, button = 0) {
  return { pointerId, clientX, clientY, currentTarget, button };
}

describe('Canvas pan gesture', () => {
  it('keeps small cumulative movement classified as a click', () => {
    const onDrag = vi.fn();
    const onGestureEnd = vi.fn();
    const gesture = useCanvasPanGesture({ onDrag, onGestureEnd });
    const target = createCaptureElement();

    expect(gesture.start(createPointerEvent(1, 100, 100, target))).toBe(true);
    expect(gesture.move(createPointerEvent(1, 104, 100, target))).toBe(false);
    expect(gesture.finish(createPointerEvent(1, 103, 102, target))).toBe(true);

    expect(onDrag).not.toHaveBeenCalled();
    expect(onGestureEnd).toHaveBeenCalledWith({ dragged: false, canceled: false });
    expect(gesture.state).toMatchObject({ active: false, dragging: false, pointerId: null });
    expect(target.setPointerCapture).not.toHaveBeenCalled();
  });

  it('captures and reports the full movement when the drag threshold is crossed', () => {
    const onDrag = vi.fn();
    const onGestureEnd = vi.fn();
    const gesture = useCanvasPanGesture({ onDrag, onGestureEnd });
    const target = createCaptureElement();

    gesture.start(createPointerEvent(7, 10, 10, target));
    expect(gesture.move(createPointerEvent(7, 14, 11, target))).toBe(true);
    expect(gesture.move(createPointerEvent(7, 20, 15, target))).toBe(true);
    expect(gesture.finish(createPointerEvent(7, 22, 15, target))).toBe(true);

    expect(onDrag.mock.calls.map(([movement]) => movement)).toMatchObject([
      { previousX: 10, previousY: 10, currentX: 14, currentY: 11, startedDragging: true },
      { previousX: 14, previousY: 11, currentX: 20, currentY: 15, startedDragging: false },
      { previousX: 20, previousY: 15, currentX: 22, currentY: 15, startedDragging: false },
    ]);
    expect(target.setPointerCapture).toHaveBeenCalledWith(7);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
    expect(onGestureEnd).toHaveBeenCalledWith({ dragged: true, canceled: false });
    expect(gesture.state).toMatchObject({ active: false, dragging: true, pointerId: null });
  });

  it('ignores unrelated pointers and marks cancellation as a non-click result', () => {
    const onDrag = vi.fn();
    const onGestureEnd = vi.fn();
    const gesture = useCanvasPanGesture({ onDrag, onGestureEnd });
    const target = createCaptureElement();

    gesture.start(createPointerEvent(2, 0, 0, target));
    expect(gesture.move(createPointerEvent(3, 20, 20, target))).toBe(false);
    expect(gesture.cancel(createPointerEvent(2, 0, 0, target))).toBe(true);

    expect(onDrag).not.toHaveBeenCalled();
    expect(onGestureEnd).toHaveBeenCalledWith({ dragged: true, canceled: true });
    expect(gesture.state.dragging).toBe(true);
  });
});

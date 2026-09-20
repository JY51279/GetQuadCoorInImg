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
  it('captures the original canvas from press and ignores another pointer release', () => {
    const gesture = useCanvasPanGesture();
    const container = createCaptureElement();
    const canvas = createCaptureElement();
    gesture.start({ ...createPointerEvent(1, 0, 0, container), target: canvas });
    expect(gesture.state.phase).toBe('pressed');
    expect(canvas.setPointerCapture).toHaveBeenCalledWith(1);
    expect(container.setPointerCapture).not.toHaveBeenCalled();
    expect(gesture.finish(createPointerEvent(2, 20, 20, container))).toBe(false);
    expect(gesture.state.phase).toBe('pressed');
    gesture.finish(createPointerEvent(1, 1, 1, container));
    expect(gesture.state.phase).toBe('idle');
    expect(canvas.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it.each(['pressed', 'dragging'])('cancels %s when permission is revoked, exactly once', phase => {
    let allowed = true;
    const onGestureEnd = vi.fn();
    const gesture = useCanvasPanGesture({ canContinue: () => allowed, onGestureEnd });
    const target = createCaptureElement();
    gesture.start(createPointerEvent(1, 0, 0, target));
    if (phase === 'dragging') gesture.move(createPointerEvent(1, 10, 0, target));
    target.releasePointerCapture.mockImplementation(id => gesture.handleLostPointerCapture({ pointerId: id }));
    allowed = false;
    expect(gesture.finish(createPointerEvent(1, 20, 0, target))).toBe(false);
    expect(gesture.state).toMatchObject({ phase: 'idle', pointerId: null, suppressClick: true });
    gesture.cancel();
    expect(onGestureEnd).toHaveBeenCalledTimes(1);
    expect(target.releasePointerCapture).toHaveBeenCalledTimes(1);
  });

  it('cleans up capture loss and resets click suppression for the next gesture', () => {
    const gesture = useCanvasPanGesture();
    const target = createCaptureElement();
    gesture.start(createPointerEvent(1, 0, 0, target));
    gesture.handleLostPointerCapture({ pointerId: 1 });
    expect(gesture.state).toMatchObject({ phase: 'idle', suppressClick: true });
    expect(target.releasePointerCapture).not.toHaveBeenCalled();
    gesture.start(createPointerEvent(2, 0, 0, target));
    expect(gesture.state.suppressClick).toBe(false);
    gesture.reset({ preserveDragResult: false, canceled: true });
    gesture.reset({ preserveDragResult: false, canceled: true });
    expect(gesture.state).toMatchObject({ phase: 'idle', suppressClick: false });
  });

  it('does not retain a gesture when native capture fails', () => {
    const gesture = useCanvasPanGesture();
    const target = createCaptureElement();
    target.setPointerCapture.mockImplementation(() => {
      throw new Error('pointer ended');
    });
    expect(gesture.start(createPointerEvent(1, 0, 0, target))).toBe(false);
    expect(gesture.state.phase).toBe('idle');
  });

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
    expect(gesture.state).toMatchObject({ phase: 'idle', active: false, suppressClick: false, pointerId: null });
    expect(target.setPointerCapture).toHaveBeenCalledWith(1);
    expect(target.releasePointerCapture).toHaveBeenCalledWith(1);
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
    expect(gesture.state).toMatchObject({ phase: 'idle', active: false, suppressClick: true, pointerId: null });
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
    expect(onGestureEnd).toHaveBeenCalledWith({ dragged: false, canceled: true });
    expect(gesture.state.suppressClick).toBe(true);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { useQuadPointGesture } from '../src/renderer/src/composables/useQuadPointGesture.js';

function createGesture() {
  const quad = [
    { x: 10, y: 10 },
    { x: 20, y: 10 },
    { x: 20, y: 20 },
    { x: 10, y: 20 },
  ];
  const target = { setPointerCapture: vi.fn(), hasPointerCapture: () => true, releasePointerCapture: vi.fn() };
  const onCommit = vi.fn();
  const canContinue = vi.fn(() => true);
  const gesture = useQuadPointGesture({
    canStart: () => true,
    canContinue,
    getActiveQuadIndex: () => 0,
    getQuad: () => quad,
    getPointerImagePoint: event =>
      Number.isFinite(event.clientX) && Number.isFinite(event.clientY) ? { x: event.clientX, y: event.clientY } : null,
    setQuadPoint: (_, index, point) => {
      quad[index] = { ...point };
      return true;
    },
    redraw: vi.fn(),
    onFinish: vi.fn(),
    onCommit,
  });
  const event = (x = 10, y = 10, pointerId = 1) => ({
    pointerId,
    button: 0,
    clientX: x,
    clientY: y,
    currentTarget: target,
  });
  return { gesture, target, event, quad, onCommit, canContinue };
}

describe('Quad point gesture', () => {
  it('commits the final point once and releases capture before notifying', () => {
    const { gesture, target, event, quad, onCommit } = createGesture();
    target.releasePointerCapture.mockImplementation(id => gesture.cancel({ pointerId: id }));
    gesture.start(event(), 0);
    gesture.move(event(11, 12));
    gesture.finish(event(13, 14));
    gesture.finish(event(20, 20));
    expect(quad[0]).toEqual({ x: 13, y: 14 });
    expect(gesture.state.active).toBe(false);
    expect(onCommit).toHaveBeenCalledExactlyOnceWith({ quadIndex: 0, pointIndex: 0, imagePoint: { x: 13, y: 14 } });
    expect(target.releasePointerCapture.mock.invocationCallOrder[0]).toBeLessThan(onCommit.mock.invocationCallOrder[0]);
  });

  it('ignores another pointer and restores the original point on cancellation', () => {
    const { gesture, event, quad, onCommit } = createGesture();
    gesture.start(event(), 0);
    gesture.move(event(11, 12));
    gesture.move(event(30, 30, 2));
    gesture.finish(event(30, 30, 2));
    gesture.cancel(event(30, 30, 2));
    expect(quad[0]).toEqual({ x: 11, y: 12 });
    expect(gesture.state.active).toBe(true);
    gesture.cancel();
    expect(quad[0]).toEqual({ x: 10, y: 10 });
    expect(onCommit).not.toHaveBeenCalled();
  });

  it.each(['invalid release', 'permission revoked'])('rolls back preview after %s', reason => {
    const { gesture, event, quad, onCommit, canContinue } = createGesture();
    gesture.start(event(), 0);
    gesture.move(event(11, 12));
    if (reason === 'permission revoked') canContinue.mockReturnValue(false);
    gesture.finish(event(reason === 'invalid release' ? NaN : 13, 14));
    expect(quad[0]).toEqual({ x: 10, y: 10 });
    expect(gesture.state.active).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('resets a failed capture and skips an unchanged release', () => {
    const { gesture, target, event, onCommit } = createGesture();
    target.setPointerCapture.mockImplementationOnce(() => {
      throw new Error('capture failed');
    });
    gesture.start(event(), 0);
    expect(gesture.state.active).toBe(false);
    gesture.start(event(), 0);
    gesture.finish(event());
    expect(onCommit).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { createPointerGestureState, transitionPointerGesture } from '../src/renderer/src/state/PointerGestureState.js';

describe('Pointer lifecycle transitions', () => {
  it('moves through pressed and dragging, then ends with no owner', () => {
    const idle = createPointerGestureState();
    const pressed = transitionPointerGesture(idle, { type: 'start', pointerId: 1 });
    const dragging = transitionPointerGesture(pressed, { type: 'drag', pointerId: 1 });
    expect(idle).toEqual({ phase: 'idle', pointerId: null });
    expect(pressed).toEqual({ phase: 'pressed', pointerId: 1 });
    expect(dragging).toEqual({ phase: 'dragging', pointerId: 1 });
    expect(transitionPointerGesture(dragging, { type: 'finish', pointerId: 1 })).toEqual(idle);
  });

  it.each(['pressed', 'dragging'])('only the owning pointer can end %s', phase => {
    const active = { phase, pointerId: 2 };
    for (const type of ['start', 'drag', 'finish', 'cancel']) {
      expect(transitionPointerGesture(active, { type, pointerId: 9 })).toBe(active);
    }
    expect(transitionPointerGesture(active, { type: 'cancel', pointerId: 2 })).toEqual(createPointerGestureState());
  });

  it('allows immediate editing without imposing a pan threshold', () => {
    const idle = createPointerGestureState();
    expect(transitionPointerGesture(idle, { type: 'start', pointerId: 3, immediate: true })).toEqual({
      phase: 'dragging',
      pointerId: 3,
    });
    expect(transitionPointerGesture(idle, { type: 'start' })).toBe(idle);
    expect(transitionPointerGesture(idle, { type: 'finish', pointerId: 3 })).toBe(idle);
  });
});

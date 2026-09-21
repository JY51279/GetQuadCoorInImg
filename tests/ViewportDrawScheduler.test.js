import { describe, expect, it, vi } from 'vitest';
import { createViewportDrawScheduler } from '../src/renderer/src/utils/ViewportDrawScheduler.js';

function createScheduler() {
  const frames = [];
  const draw = vi.fn();
  const canDraw = vi.fn(() => true);
  const requestFrame = vi.fn(callback => {
    frames.push(callback);
    return frames.length;
  });
  const cancelFrame = vi.fn();
  return {
    scheduler: createViewportDrawScheduler({ draw, canDraw, requestFrame, cancelFrame }),
    frames,
    draw,
    canDraw,
    requestFrame,
    cancelFrame,
  };
}

describe('Viewport draw scheduling', () => {
  it('coalesces repeated requests and permits another frame after drawing', () => {
    const { scheduler, frames, draw, requestFrame } = createScheduler();
    scheduler.schedule();
    scheduler.schedule();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    frames[0]();
    expect(draw).toHaveBeenCalledTimes(1);
    scheduler.schedule();
    expect(requestFrame).toHaveBeenCalledTimes(2);
  });

  it('ignores canceled callbacks without losing a newer pending frame', () => {
    const { scheduler, frames, draw, cancelFrame, requestFrame } = createScheduler();
    scheduler.schedule();
    scheduler.cancel();
    scheduler.schedule();
    frames[0]();
    expect(draw).not.toHaveBeenCalled();
    scheduler.schedule();
    expect(requestFrame).toHaveBeenCalledTimes(2);
    frames[1]();
    expect(draw).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('rejects immediate, queued and new draws after disposal', () => {
    const { scheduler, frames, draw, requestFrame, cancelFrame } = createScheduler();
    scheduler.schedule();
    scheduler.dispose();
    scheduler.dispose();
    frames[0]();
    scheduler.drawNow();
    scheduler.schedule();
    expect(draw).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    expect(cancelFrame).toHaveBeenCalledTimes(1);
  });

  it('rechecks image availability when a queued frame runs', () => {
    const { scheduler, frames, draw, canDraw, requestFrame } = createScheduler();
    scheduler.schedule();
    canDraw.mockReturnValue(false);
    frames[0]();
    scheduler.drawNow();
    scheduler.schedule();
    expect(draw).not.toHaveBeenCalled();
    expect(requestFrame).toHaveBeenCalledTimes(1);
    canDraw.mockReturnValue(true);
    scheduler.schedule();
    frames[1]();
    expect(draw).toHaveBeenCalledTimes(1);
  });
});

// One pending frame per viewport. Generation checks reject canceled callbacks even if already queued.
export function createViewportDrawScheduler({
  canDraw,
  draw,
  requestFrame = callback => requestAnimationFrame(callback),
  cancelFrame = id => cancelAnimationFrame(id),
}) {
  let disposed = false;
  let frameId = null;
  let generation = 0;

  function cancel() {
    generation += 1;
    if (frameId === null) return;
    cancelFrame(frameId);
    frameId = null;
  }

  function drawNow() {
    if (disposed || !canDraw()) return;
    draw();
  }

  function schedule() {
    if (disposed || !canDraw() || frameId !== null) return;
    const requestedGeneration = generation;
    frameId = requestFrame(() => {
      if (disposed || requestedGeneration !== generation) return;
      frameId = null;
      drawNow();
    });
  }

  function dispose() {
    disposed = true;
    cancel();
  }

  return { schedule, drawNow, cancel, dispose };
}

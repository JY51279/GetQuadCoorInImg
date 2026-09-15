import { describe, expect, it, vi } from 'vitest';
import { useQuadTranslationGesture } from '../src/renderer/src/composables/useQuadTranslationGesture.js';

const QUAD = [
  { x: 2, y: 3 },
  { x: 8, y: 3 },
  { x: 8, y: 9 },
  { x: 2, y: 9 },
];

function createPointerEvent(pointerId, x, y, overrides = {}) {
  return {
    button: 0,
    pointerId,
    imagePoint: { x, y },
    currentTarget: {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    },
    ...overrides,
  };
}

function createGesture(overrides = {}) {
  const callbacks = {
    previewQuad: vi.fn(() => true),
    onStart: vi.fn(),
    onCommit: vi.fn(),
    onCancel: vi.fn(),
  };
  const gesture = useQuadTranslationGesture({
    canStart: () => true,
    getQuad: () => QUAD,
    getImageSize: () => ({ width: 20, height: 20 }),
    getPointerImagePoint: event => event.imagePoint,
    ...callbacks,
    ...overrides,
  });
  return { gesture, callbacks };
}

describe('Quad translation gesture', () => {
  it('previews and commits one uniform image-coordinate translation', () => {
    const { gesture, callbacks } = createGesture();
    const startEvent = createPointerEvent(7, 5, 6);

    expect(gesture.start(startEvent, 0)).toBe(true);
    expect(gesture.move(createPointerEvent(7, 9, 8))).toBe(true);
    expect(gesture.finish(createPointerEvent(7, 9, 8))).toBe(true);

    expect(callbacks.onStart).toHaveBeenCalledWith({ quadIndex: 0 });
    expect(callbacks.previewQuad).toHaveBeenCalledWith(0, [
      { x: 6, y: 5 },
      { x: 12, y: 5 },
      { x: 12, y: 11 },
      { x: 6, y: 11 },
    ]);
    expect(callbacks.onCommit).toHaveBeenCalledWith({
      quadIndex: 0,
      imageDelta: { x: 4, y: 2 },
      imagePoints: [
        { x: 6, y: 5 },
        { x: 12, y: 5 },
        { x: 12, y: 11 },
        { x: 6, y: 11 },
      ],
    });
    expect(callbacks.onCancel).not.toHaveBeenCalled();
    expect(gesture.state.active).toBe(false);
  });

  it('restores the original Quad when canceled', () => {
    const { gesture, callbacks } = createGesture();
    gesture.start(createPointerEvent(8, 5, 6), 0);
    gesture.move(createPointerEvent(8, 9, 8));

    expect(gesture.cancel()).toBe(true);

    expect(callbacks.previewQuad).toHaveBeenLastCalledWith(0, QUAD);
    expect(callbacks.onCancel).toHaveBeenCalledWith({ quadIndex: 0, reason: 'canceled' });
    expect(callbacks.onCommit).not.toHaveBeenCalled();
  });

  it('does not start when translation is unavailable', () => {
    const { gesture, callbacks } = createGesture({ canStart: () => false });

    expect(gesture.start(createPointerEvent(9, 5, 6), 0)).toBe(false);
    expect(callbacks.onStart).not.toHaveBeenCalled();
  });
});

import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useQuadOverlay } from '../src/renderer/src/composables/useQuadOverlay.js';

function createQuad(left) {
  return [
    { x: left, y: 1 },
    { x: left + 4, y: 1 },
    { x: left + 4, y: 5 },
    { x: left, y: 5 },
  ];
}

function createCanvasContext() {
  return {
    canvas: { width: 200, height: 100 },
    clearRect: vi.fn(),
    save: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    closePath: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    restore: vi.fn(),
    clip: vi.fn(),
  };
}

describe('Quad overlay', () => {
  it('owns cloned image-coordinate Quads and remaps shown indices after deletion', () => {
    const activeQuadIndex = ref(1);
    const sourceQuads = [createQuad(1), createQuad(10), createQuad(20)];
    const overlay = useQuadOverlay({ activeQuadIndex, scale: ref(2) });

    overlay.resetQuads(sourceQuads, { x: 2, y: 3 });
    expect(overlay.getQuad(0)[0]).toEqual({ x: 2, y: 3 });
    sourceQuads[0][0].x = 999;
    expect(overlay.getQuad(0)[0]).toEqual({ x: 2, y: 3 });

    overlay.addShownQuad(0);
    overlay.addShownQuad(1);
    overlay.addShownQuad(2);
    expect([...overlay.shownQuadIndices]).toEqual([0, 2, 1]);

    overlay.resetQuads([createQuad(10), createQuad(20)], 1, {
      indexMutations: [{ type: 'delete', index: 0 }],
    });
    expect([...overlay.shownQuadIndices]).toEqual([1, 0]);
  });

  it('updates a Quad point through its narrow editing interface', () => {
    const overlay = useQuadOverlay({ activeQuadIndex: ref(0), scale: ref(1) });
    overlay.resetQuads([createQuad(0)], 1);

    expect(overlay.setQuadPoint(0, 2, { x: 8, y: 9 })).toBe(true);
    expect(overlay.getQuad(0)[2]).toEqual({ x: 8, y: 9 });
    expect(overlay.setQuadPoint(0, 4, { x: 1, y: 1 })).toBe(false);
  });

  it('previews all four translated points and exposes the active Quad center handle', () => {
    const overlay = useQuadOverlay({
      activeQuadIndex: ref(0),
      scale: ref(2),
      imageToCanvas: point => ({ x: point.x * 2, y: point.y * 2 }),
    });
    overlay.resetQuads([createQuad(1)], 1);

    expect(overlay.activeCenterHandle.value).toEqual({ x: 7, y: 7 });
    expect(overlay.activeEdgeHandles.value).toEqual([
      { edgeIndex: 0, startPointIndex: 0, endPointIndex: 1, x: 7, y: 3, angle: 0 },
      { edgeIndex: 1, startPointIndex: 1, endPointIndex: 2, x: 11, y: 7, angle: 90 },
      { edgeIndex: 2, startPointIndex: 2, endPointIndex: 3, x: 7, y: 11, angle: 180 },
      { edgeIndex: 3, startPointIndex: 3, endPointIndex: 0, x: 3, y: 7, angle: -90 },
    ]);
    const translatedPoints = createQuad(4);
    expect(overlay.setQuadPoints(0, translatedPoints)).toBe(true);
    translatedPoints[0].x = 999;
    expect(overlay.getQuad(0)).toEqual(createQuad(4));
    expect(overlay.setQuadPoints(0, createQuad(4).slice(0, 3))).toBe(false);
  });

  it('draws mapped Quad pixels and selects exactly one hovered Quad', () => {
    const context = createCanvasContext();
    const mousePoint = { x: 5, y: 5 };
    const imageToCanvas = vi.fn(point => ({ x: point.x * 2, y: point.y * 2 }));
    const onSelectQuad = vi.fn();
    const overlay = useQuadOverlay({
      activeQuadIndex: ref(-1),
      scale: ref(2),
      getContext: () => context,
      imageToCanvas,
      isMouseOver: () => true,
      mousePoint,
      hoverActivationEnabled: () => true,
      onSelectQuad,
    });
    overlay.resetQuads([createQuad(1)], 1);
    overlay.addShownQuad(0);

    expect(overlay.drawOverlay()).toBe(true);
    expect(imageToCanvas).toHaveBeenCalledTimes(4);
    expect(imageToCanvas.mock.calls.every(call => call.length === 1)).toBe(true);
    expect(overlay.hoveredIndicesText.value).toBe('1');

    overlay.updateHoveredInfo(true);
    expect(onSelectQuad).toHaveBeenCalledWith(0);
  });

  it('switches from the active Quad when the pointer enters one different Quad', () => {
    const context = createCanvasContext();
    const onSelectQuad = vi.fn();
    const overlay = useQuadOverlay({
      activeQuadIndex: ref(0),
      scale: ref(1),
      getContext: () => context,
      isMouseOver: () => true,
      mousePoint: { x: 12, y: 2 },
      hoverActivationEnabled: () => true,
      onSelectQuad,
    });
    overlay.resetQuads([createQuad(1), createQuad(10)], 1);
    overlay.addShownQuad(0);
    overlay.addShownQuad(1);
    overlay.drawOverlay();

    overlay.updateHoveredInfo(true);

    expect(onSelectQuad).toHaveBeenCalledWith(1);
  });

  it('keeps the active Quad when the pointer moves outside every Quad', () => {
    const context = createCanvasContext();
    const mousePoint = { x: 2, y: 2 };
    const onSelectQuad = vi.fn();
    const overlay = useQuadOverlay({
      activeQuadIndex: ref(0),
      scale: ref(1),
      getContext: () => context,
      isMouseOver: () => true,
      mousePoint,
      hoverActivationEnabled: () => true,
      onSelectQuad,
    });
    overlay.resetQuads([createQuad(1)], 1);
    overlay.addShownQuad(0);
    overlay.drawOverlay();

    mousePoint.x = 100;
    mousePoint.y = 100;
    overlay.updateHoveredInfo(true);

    expect(overlay.hoveredIndicesText.value).toBe('');
    expect(onSelectQuad).not.toHaveBeenCalled();
  });

  it('keeps the active Quad when multiple overlapping Quads are under the pointer', () => {
    const context = createCanvasContext();
    const onSelectQuad = vi.fn();
    const overlay = useQuadOverlay({
      activeQuadIndex: ref(0),
      scale: ref(1),
      getContext: () => context,
      isMouseOver: () => true,
      mousePoint: { x: 2, y: 2 },
      hoverActivationEnabled: () => true,
      onSelectQuad,
    });
    overlay.resetQuads([createQuad(1), createQuad(1)], 1);
    overlay.addShownQuad(0);
    overlay.addShownQuad(1);
    overlay.drawOverlay();

    overlay.updateHoveredInfo(true);

    expect(overlay.hoveredIndicesText.value).toBe('2 1');
    expect(onSelectQuad).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range display index without changing visibility', () => {
    const outputMessage = vi.fn();
    const overlay = useQuadOverlay({ activeQuadIndex: ref(-1), scale: ref(1), outputMessage });
    overlay.resetQuads([createQuad(0)], 1);

    overlay.toggleShownQuad(2);

    expect([...overlay.shownQuadIndices]).toEqual([]);
    expect(outputMessage).toHaveBeenCalledWith('Quad 显示序号超出范围。');
  });
});

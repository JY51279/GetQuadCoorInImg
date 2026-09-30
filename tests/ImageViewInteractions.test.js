/* @vitest-environment jsdom */
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImageView from '../src/renderer/src/components/ImageView.vue';
import { QUAD_TRANSLATION_TARGET } from '../src/renderer/src/utils/QuadGeometry.js';

const QUAD = [
  { x: 10, y: 10 },
  { x: 40, y: 10 },
  { x: 40, y: 40 },
  { x: 10, y: 40 },
];

const DEFAULT_QUAD_INTERACTION = Object.freeze({
  hoverActivation: false,
  pointDrag: false,
  wholeQuadDrag: false,
  edgeDrag: false,
});

const DIRECT_QUAD_INTERACTION = Object.freeze({
  hoverActivation: true,
  pointDrag: true,
  wholeQuadDrag: true,
  edgeDrag: true,
});

function createCanvasContext(canvas) {
  return {
    canvas,
    beginPath: vi.fn(),
    clearRect: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    drawImage: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    lineTo: vi.fn(),
    moveTo: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    setLineDash: vi.fn(),
    setTransform: vi.fn(),
    stroke: vi.fn(),
    strokeRect: vi.fn(),
  };
}

function dispatchEscapeFromDocument() {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event;
}

async function mountReadyImage(overrides = {}) {
  const wrapper = mount(ImageView, {
    attachTo: document.body,
    props: {
      canEdit: true,
      canInteract: true,
      activeQuadIndex: 0,
      selectedDots: [],
      quadInteractionCapabilities: DIRECT_QUAD_INTERACTION,
      ...overrides,
    },
  });
  expect(
    wrapper.vm.presentImageSession({
      image: { src: 'prepared-image', naturalWidth: 100, naturalHeight: 100 },
      displaySize: { width: 100, height: 100 },
    }),
  ).toBe(true);
  await nextTick();
  return wrapper;
}

describe('ImageView interactions', () => {
  it.each(['.quad-point-handle', '.quad-translate-handle', '.quad-edge-handle'])(
    'restores %s when all image interaction is disabled',
    async selector => {
      const wrapper = await mountReadyImage();
      wrapper.vm.resetQuadsArray([QUAD], 1);
      await nextTick();
      const handle = wrapper.find(selector);
      const startX = Number.parseFloat(handle.element.style.left);
      const startY = Number.parseFloat(handle.element.style.top);
      handle.element.setPointerCapture = vi.fn();
      handle.element.hasPointerCapture = () => true;
      handle.element.releasePointerCapture = vi.fn();
      await handle.trigger('pointerdown', { button: 0, pointerId: 1, clientX: startX, clientY: startY });
      await handle.trigger('pointermove', { pointerId: 1, clientX: startX + 20, clientY: startY + 10 });
      await wrapper.setProps({ canInteract: false });
      expect(handle.element.releasePointerCapture).toHaveBeenCalledWith(1);
      expect(Number.parseFloat(handle.element.style.left)).toBe(startX);
      expect(Number.parseFloat(handle.element.style.top)).toBe(startY);
      await handle.trigger('pointerup', { pointerId: 1, clientX: startX + 20, clientY: startY + 10 });
      expect(wrapper.emitted('commit-quad-point-drag')).toBeUndefined();
      expect(wrapper.emitted('commit-quad-translation')).toBeUndefined();
      wrapper.unmount();
    },
  );

  it('does not commit a point preview if the release coordinates are invalid', async () => {
    const wrapper = await mountReadyImage();
    wrapper.vm.resetQuadsArray([QUAD], 1);
    await nextTick();
    const handle = wrapper.find('.quad-point-handle');
    const originalLeft = handle.element.style.left;
    await handle.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 20, clientY: 20 });
    await handle.trigger('pointermove', { pointerId: 1, clientX: 40, clientY: 30 });
    const previewLeft = handle.element.style.left;
    await handle.trigger('pointercancel', { pointerId: 2 });
    expect(handle.element.style.left).toBe(previewLeft);
    expect(previewLeft).not.toBe(originalLeft);
    await handle.trigger('pointerup', { pointerId: 1, clientX: NaN, clientY: 30 });
    expect(handle.element.style.left).toBe(originalLeft);
    expect(wrapper.emitted('commit-quad-point-drag')).toBeUndefined();
    wrapper.unmount();
  });

  it('prevents editing gestures from taking ownership while a canvas press is active', async () => {
    const wrapper = await mountReadyImage();
    wrapper.vm.resetQuadsArray([QUAD], 1);
    await nextTick();
    const container = wrapper.find('.image-container');
    await container.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 150, clientY: 150 });
    for (const selector of ['.quad-point-handle', '.quad-translate-handle']) {
      const handle = wrapper.find(selector);
      await handle.trigger('pointerdown', { button: 0, pointerId: 2, clientX: 20, clientY: 20 });
      await handle.trigger('pointerup', { pointerId: 2, clientX: 40, clientY: 30 });
    }
    expect(wrapper.emitted('quad-translation-start')).toBeUndefined();
    expect(wrapper.emitted('commit-quad-point-drag')).toBeUndefined();
    await wrapper.setProps({ canInteract: false });
    await wrapper.setProps({ canInteract: true });
    const handle = wrapper.find('.quad-translate-handle');
    await handle.trigger('pointerdown', { button: 0, pointerId: 3, clientX: 50, clientY: 50 });
    expect(wrapper.emitted('quad-translation-start')).toHaveLength(1);
    wrapper.unmount();
  });

  it('clears capture, overlays, selected dots and scheduled draws through one lifecycle entry', async () => {
    const callbacks = [];
    vi.stubGlobal('requestAnimationFrame', callback => {
      callbacks.push(callback);
      return callbacks.length;
    });
    const wrapper = await mountReadyImage();
    wrapper.vm.resetQuadsArray([QUAD], 1);
    await nextTick();
    const canvas = wrapper.find('canvas');
    const context = canvas.element.getContext('2d');
    canvas.element.setPointerCapture = vi.fn();
    canvas.element.hasPointerCapture = () => true;
    canvas.element.releasePointerCapture = vi.fn();
    await canvas.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    await canvas.trigger('pointermove', { pointerId: 1, clientX: 120, clientY: 110 });
    const drawCount = context.drawImage.mock.calls.length;
    expect(wrapper.vm.presentImageSession(null)).toBe(true);
    await nextTick();
    callbacks.forEach(callback => callback());
    expect(canvas.element.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(wrapper.find('.quad-point-handle').exists()).toBe(false);
    expect(wrapper.emitted('update-selected-dots').at(-1)).toEqual([[]]);
    expect(wrapper.find('.rectangle').isVisible()).toBe(false);
    expect(context.drawImage).toHaveBeenCalledTimes(drawCount);
    expect(wrapper.vm.presentImageSession(null)).toBe(true);
    wrapper.unmount();
  });

  it('does not convert a canceled old pan into a point on the newly presented image', async () => {
    const wrapper = await mountReadyImage();
    const canvas = wrapper.find('canvas');
    await canvas.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 100, clientY: 100 });
    wrapper.vm.presentImageSession({
      image: { src: 'new', naturalWidth: 100, naturalHeight: 100 },
      displaySize: { width: 100, height: 100 },
    });
    await nextTick();
    const count = wrapper.emitted('update-selected-dots').length;
    await canvas.trigger('pointerup', { pointerId: 1, clientX: 100, clientY: 100 });
    await canvas.trigger('click', { clientX: 100, clientY: 100 });
    expect(wrapper.emitted('update-selected-dots')).toHaveLength(count);
    await canvas.trigger('pointerdown', { button: 0, pointerId: 2, clientX: 100, clientY: 100 });
    await canvas.trigger('pointerup', { pointerId: 2, clientX: 100, clientY: 100 });
    await canvas.trigger('click', { clientX: 100, clientY: 100 });
    expect(wrapper.emitted('update-selected-dots')).toHaveLength(count + 1);
    wrapper.unmount();
  });

  it('cancels an editing preview before changing its coordinate frame with zoom', async () => {
    const wrapper = await mountReadyImage();
    wrapper.vm.resetQuadsArray([QUAD], 1);
    await nextTick();
    const handle = wrapper.find('.quad-translate-handle');
    await handle.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 50, clientY: 50 });
    await handle.trigger('pointermove', { pointerId: 1, clientX: 70, clientY: 60 });
    wrapper
      .find('.image-container')
      .element.dispatchEvent(new WheelEvent('wheel', { clientX: 80, clientY: 80, deltaY: -100, bubbles: true }));
    await nextTick();
    await handle.trigger('pointerup', { pointerId: 1, clientX: 70, clientY: 60 });
    expect(wrapper.emitted('commit-quad-translation')).toBeUndefined();
    expect(wrapper.emitted('quad-translation-cancel').at(-1)[0].reason).toBe('viewport-changed');
    wrapper.unmount();
  });

  it('focuses a mapped Quad using display-image dimensions and keeps its handles visible', async () => {
    const wrapper = await mountReadyImage();
    wrapper.vm.resetQuadsArray(
      [
        [
          { x: 200, y: 100 },
          { x: 1190, y: 100 },
          { x: 1190, y: 495 },
          { x: 200, y: 495 },
        ],
      ],
      { x: 0.1, y: 0.2 },
    );

    expect(wrapper.vm.focusQuad(0)).toEqual({ success: true });
    await nextTick();
    expect(Number(wrapper.find('.scale-number').element.value)).toBeCloseTo(1.68);
    const handles = wrapper.findAll('.quad-point-handle');
    expect(handles).toHaveLength(4);
    for (const handle of handles) {
      expect(parseFloat(handle.element.style.left)).toBeGreaterThan(16);
      expect(parseFloat(handle.element.style.left)).toBeLessThan(184);
      expect(parseFloat(handle.element.style.top)).toBeGreaterThan(16);
      expect(parseFloat(handle.element.style.top)).toBeLessThan(184);
    }
    const center = wrapper.find('.quad-translate-handle');
    expect(parseFloat(center.element.style.left)).toBeCloseTo(100);
    expect(parseFloat(center.element.style.top)).toBeCloseTo(100);
    expect(wrapper.emitted('commit-quad-point-drag')).toBeUndefined();
    expect(wrapper.emitted('commit-quad-translation')).toBeUndefined();
    wrapper.unmount();
  });

  it('keeps zoom controls and wheel usable after focusing a huge Quad below 0.1', async () => {
    const wrapper = await mountReadyImage();
    wrapper.vm.resetQuadsArray(
      [
        [
          { x: -10000, y: -10000 },
          { x: 19999, y: -10000 },
          { x: 19999, y: 19999 },
          { x: -10000, y: 19999 },
        ],
      ],
      1,
    );
    expect(wrapper.vm.focusQuad(0).success).toBe(true);
    await nextTick();
    const input = wrapper.find('.scale-number');
    expect(Number(input.element.value)).toBeCloseTo(0.0056);
    expect(Number(input.attributes('min'))).toBe(0.001);

    await input.setValue('0.006');
    expect(Number(input.element.value)).toBe(0.006);
    wrapper
      .find('.image-container')
      .element.dispatchEvent(new WheelEvent('wheel', { clientX: 150, clientY: 150, deltaY: -100, bubbles: true }));
    await nextTick();
    expect(Number(input.element.value)).toBeGreaterThan(0.006);
    expect(Number(input.element.value)).toBeLessThan(0.01);
    await wrapper.find('.scale-range').setValue('0');
    expect(Number(input.element.value)).toBe(0.001);

    wrapper.vm.presentImageSession({
      image: { src: 'next-image', naturalWidth: 100, naturalHeight: 100 },
      displaySize: { width: 100, height: 100 },
    });
    await nextTick();
    expect(Number(input.attributes('min'))).toBe(0.1);
    expect(Number(input.element.value)).toBe(2);
    wrapper.unmount();
  });

  it.each([
    [
      2,
      [
        [-1, 2.5],
        [-1, 3.13],
        [1, 2.5],
        [1, 2],
      ],
    ],
    [
      9,
      [
        [-1, 10],
        [-1, 12.5],
        [1, 10],
        [1, 8],
      ],
    ],
  ])('step zoom from %s keeps the pixel under the mouse in place', async (initialScale, steps) => {
    const wrapper = await mountReadyImage();
    const input = wrapper.find('.scale-number');
    await input.setValue(String(initialScale));
    const pointer = { clientX: 61, clientY: 81 };
    await wrapper.find('.image-container').trigger('mouseenter', pointer);
    window.dispatchEvent(new MouseEvent('mousemove', pointer));
    await nextTick();
    const canvas = wrapper.find('canvas.canvas-layer');
    await canvas.trigger('click', pointer);
    const originalPoint = wrapper.emitted('update-selected-dots').at(-1);

    for (const [deltaY, expectedScale] of steps) {
      expect(wrapper.vm.zoomAtMouse(deltaY)).toEqual({ success: true });
      await nextTick();
      expect(Number(input.element.value)).toBe(expectedScale);
      await canvas.trigger('click', pointer);
      expect(wrapper.emitted('update-selected-dots').at(-1)).toEqual(originalPoint);
    }
    wrapper.unmount();
  });

  it.each([
    [0.1, 1, 0.1],
    [59, -1, 60],
  ])('clamps step zoom from %s to the scale limit', async (initialScale, deltaY, expectedScale) => {
    const wrapper = await mountReadyImage();
    const input = wrapper.find('.scale-number');
    await input.setValue(String(initialScale));
    const pointer = { clientX: 5, clientY: 5 };
    await wrapper.find('.image-container').trigger('mouseenter', pointer);
    window.dispatchEvent(new MouseEvent('mousemove', pointer));
    await nextTick();
    for (let step = 0; step < 2; step++) {
      expect(wrapper.vm.zoomAtMouse(deltaY)).toEqual({ success: true });
      await nextTick();
      expect(Number(input.element.value)).toBe(expectedScale);
    }
    wrapper.unmount();
  });

  it('only step zooms when interaction is enabled and the mouse is over the image', async () => {
    const wrapper = await mountReadyImage();
    expect(wrapper.vm.zoomAtMouse(-1).success).toBe(false);
    const pointer = { clientX: 150, clientY: 150 };
    await wrapper.find('.image-container').trigger('mouseenter', pointer);
    window.dispatchEvent(new MouseEvent('mousemove', pointer));
    await nextTick();
    const input = wrapper.find('.scale-number');
    await input.setValue('1');
    expect(wrapper.vm.zoomAtMouse(-1).success).toBe(false);
    await input.setValue('2');
    await wrapper.setProps({ canInteract: false });
    expect(wrapper.vm.zoomAtMouse(-1).success).toBe(false);
    expect(Number(input.element.value)).toBe(2);
    wrapper.vm.presentImageSession(null);
    await wrapper.setProps({ canInteract: true });
    expect(wrapper.vm.zoomAtMouse(-1).success).toBe(false);
    wrapper.unmount();
  });

  beforeEach(() => {
    const contexts = new WeakMap();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function getContext() {
      if (!contexts.has(this)) contexts.set(this, createCanvasContext(this));
      return contexts.get(this);
    });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      right: 200,
      bottom: 200,
      width: 200,
      height: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    vi.stubGlobal('requestAnimationFrame', callback => {
      queueMicrotask(() => callback(0));
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('allows point selection only while editing is enabled', async () => {
    const wrapper = await mountReadyImage({ canEdit: false });
    const canvas = wrapper.find('canvas.canvas-layer');
    const emissionCount = wrapper.emitted('update-selected-dots')?.length ?? 0;

    await canvas.trigger('click', { clientX: 100, clientY: 100 });
    expect(wrapper.emitted('update-selected-dots')).toHaveLength(emissionCount);

    await wrapper.setProps({ canEdit: true });
    await canvas.trigger('click', { clientX: 100, clientY: 100 });

    expect(wrapper.emitted('update-selected-dots').at(-1)).toEqual([[{ x: 50, y: 50 }]]);
    wrapper.unmount();
  });

  it('keeps point selection available but hides direct Quad controls in default mode', async () => {
    const wrapper = await mountReadyImage({ quadInteractionCapabilities: DEFAULT_QUAD_INTERACTION });
    wrapper.vm.resetQuadsArray([QUAD], 1);
    await nextTick();

    expect(wrapper.find('.quad-point-handle').exists()).toBe(false);
    expect(wrapper.find('.quad-edge-handle').exists()).toBe(false);
    expect(wrapper.find('.quad-translate-handle').exists()).toBe(false);

    await wrapper.find('canvas.canvas-layer').trigger('click', { clientX: 100, clientY: 100 });
    expect(wrapper.emitted('update-selected-dots').at(-1)).toEqual([[{ x: 50, y: 50 }]]);
    wrapper.unmount();
  });

  it('cancels a Quad point preview when direct editing is turned off', async () => {
    const wrapper = await mountReadyImage();
    wrapper.vm.resetQuadsArray([QUAD], 1);
    await nextTick();

    const handle = wrapper.find('.quad-point-handle');
    const startX = Number.parseFloat(handle.element.style.left);
    const startY = Number.parseFloat(handle.element.style.top);
    await handle.trigger('pointerdown', { button: 0, pointerId: 6, clientX: startX, clientY: startY });
    await handle.trigger('pointermove', { pointerId: 6, clientX: startX + 20, clientY: startY + 10 });
    await wrapper.setProps({ quadInteractionCapabilities: DEFAULT_QUAD_INTERACTION });
    await nextTick();

    expect(wrapper.find('.quad-point-handle').exists()).toBe(false);
    expect(wrapper.emitted('commit-quad-point-drag')).toBeUndefined();

    await wrapper.setProps({ quadInteractionCapabilities: DIRECT_QUAD_INTERACTION });
    await nextTick();
    const restoredHandle = wrapper.find('.quad-point-handle');
    expect(Number.parseFloat(restoredHandle.element.style.left)).toBe(startX);
    expect(Number.parseFloat(restoredHandle.element.style.top)).toBe(startY);
    wrapper.unmount();
  });

  it('uses device pixels for canvas backing stores while preserving CSS coordinates', async () => {
    const wrapper = await mountReadyImage({ displayPixelRatio: 1 });
    await wrapper.setProps({ displayPixelRatio: 1.5 });
    await nextTick();
    const canvases = wrapper.findAll('canvas.canvas-layer');

    expect(canvases).toHaveLength(2);
    for (const canvas of canvases) {
      expect(canvas.element.width).toBe(300);
      expect(canvas.element.height).toBe(300);
      expect(canvas.element.style.width).toBe('200px');
      expect(canvas.element.style.height).toBe('200px');
      expect(canvas.element.getContext('2d').setTransform).toHaveBeenCalledWith(1.5, 0, 0, 1.5, 0, 0);
    }
    wrapper.unmount();
  });

  it('emits one explicit dataset-coordinate update after dragging an active Quad point', async () => {
    const wrapper = await mountReadyImage();
    wrapper.vm.resetQuadsArray([QUAD], 1);
    await nextTick();

    const handle = wrapper.find('.quad-point-handle');
    const startX = Number.parseFloat(handle.element.style.left);
    const startY = Number.parseFloat(handle.element.style.top);
    await handle.trigger('pointerdown', { button: 0, pointerId: 7, clientX: startX, clientY: startY });
    await handle.trigger('pointermove', { pointerId: 7, clientX: startX + 20, clientY: startY + 10 });
    await handle.trigger('pointerup', { pointerId: 7, clientX: startX + 20, clientY: startY + 10 });

    expect(wrapper.emitted('commit-quad-point-drag')).toEqual([
      [
        {
          quadIndex: 0,
          pointIndex: 0,
          imagePoint: { x: 20, y: 15 },
        },
      ],
    ]);
    wrapper.unmount();
  });

  it('restores a point preview and consumes Escape before workspace shortcuts', async () => {
    const wrapper = await mountReadyImage();
    wrapper.vm.resetQuadsArray([QUAD], 1);
    await nextTick();

    let handle = wrapper.find('.quad-point-handle');
    const startX = Number.parseFloat(handle.element.style.left);
    const startY = Number.parseFloat(handle.element.style.top);
    await handle.trigger('pointerdown', { button: 0, pointerId: 10, clientX: startX, clientY: startY });
    await handle.trigger('pointermove', { pointerId: 10, clientX: startX + 20, clientY: startY + 10 });

    const workspaceKeyDown = vi.fn();
    window.addEventListener('keydown', workspaceKeyDown);
    const escapeEvent = dispatchEscapeFromDocument();
    window.removeEventListener('keydown', workspaceKeyDown);
    await nextTick();

    handle = wrapper.find('.quad-point-handle');
    expect(Number.parseFloat(handle.element.style.left)).toBe(startX);
    expect(Number.parseFloat(handle.element.style.top)).toBe(startY);
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(workspaceKeyDown).not.toHaveBeenCalled();
    expect(wrapper.emitted('commit-quad-point-drag')).toBeUndefined();
    wrapper.unmount();
  });

  it.each([
    ['.quad-translate-handle', [0, 1, 2, 3]],
    ['.quad-edge-handle', [0, 1]],
  ])('drags %s beyond the image from an already out-of-bounds Quad', async (selector, movedIndices) => {
    const wrapper = await mountReadyImage();
    const quad = [
      { x: -10, y: -10 },
      { x: 40, y: -10 },
      { x: 40, y: 40 },
      { x: -10, y: 40 },
    ];
    wrapper.vm.resetQuadsArray([quad], 1);
    await nextTick();
    const handle = wrapper.find(selector);
    const startX = parseFloat(handle.element.style.left);
    const startY = parseFloat(handle.element.style.top);
    await handle.trigger('pointerdown', { button: 0, pointerId: 15, clientX: startX, clientY: startY });
    await handle.trigger('pointermove', { pointerId: 15, clientX: startX - 80, clientY: startY - 60 });
    expect(parseFloat(handle.element.style.left)).toBeCloseTo(startX - 80);
    expect(parseFloat(handle.element.style.top)).toBeCloseTo(startY - 60);
    await handle.trigger('pointerup', { pointerId: 15, clientX: startX - 80, clientY: startY - 60 });
    expect(wrapper.emitted('commit-quad-translation')).toHaveLength(1);
    expect(wrapper.emitted('commit-quad-translation')[0][0]).toMatchObject({
      imageDelta: { x: -40, y: -30 },
      imagePoints: quad.map((point, index) =>
        movedIndices.includes(index) ? { x: point.x - 40, y: point.y - 30 } : point,
      ),
    });
    wrapper.unmount();
  });

  it('still rejects outside point picks and clamps a dragged vertex to the last image pixel', async () => {
    const wrapper = await mountReadyImage();
    wrapper.vm.resetQuadsArray([QUAD], 1);
    await nextTick();
    const selectionsBefore = wrapper.emitted('update-selected-dots').length;
    await wrapper.find('canvas.canvas-layer').trigger('click', { clientX: -10, clientY: 100 });
    expect(wrapper.emitted('update-selected-dots')).toHaveLength(selectionsBefore);
    const handle = wrapper.find('.quad-point-handle');
    await handle.trigger('pointerdown', { button: 0, pointerId: 16, clientX: 21, clientY: 21 });
    await handle.trigger('pointerup', { pointerId: 16, clientX: -50, clientY: 250 });
    expect(wrapper.emitted('commit-quad-point-drag')[0][0].imagePoint).toEqual({ x: 0, y: 99 });
    wrapper.unmount();
  });

  it('previews and commits one whole-Quad translation without hover-switching the active Quad', async () => {
    const wrapper = await mountReadyImage({ quadInteractionCapabilities: DIRECT_QUAD_INTERACTION });
    const secondQuad = QUAD.map(point => ({ x: point.x + 50, y: point.y }));
    wrapper.vm.resetQuadsArray([QUAD, secondQuad], 1);
    wrapper.vm.addShowQuadIndex(0);
    wrapper.vm.addShowQuadIndex(1);
    wrapper.vm.redrawQuadOverlay();
    await nextTick();

    const handle = wrapper.find('.quad-translate-handle');
    const startX = Number.parseFloat(handle.element.style.left);
    const startY = Number.parseFloat(handle.element.style.top);
    await handle.trigger('pointerdown', { button: 0, pointerId: 8, clientX: startX, clientY: startY });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: startX + 100, clientY: startY }));
    await nextTick();
    await handle.trigger('pointermove', { pointerId: 8, clientX: startX + 20, clientY: startY + 10 });
    await handle.trigger('pointerup', { pointerId: 8, clientX: startX + 20, clientY: startY + 10 });

    expect(wrapper.emitted('quad-translation-start')).toEqual([
      [{ quadIndex: 0, target: { type: QUAD_TRANSLATION_TARGET.WHOLE } }],
    ]);
    expect(wrapper.emitted('select-quad-index')).toBeUndefined();
    expect(wrapper.emitted('commit-quad-translation')).toEqual([
      [
        {
          quadIndex: 0,
          target: { type: QUAD_TRANSLATION_TARGET.WHOLE },
          imageDelta: { x: 10, y: 5 },
          imagePoints: [
            { x: 20, y: 15 },
            { x: 50, y: 15 },
            { x: 50, y: 45 },
            { x: 20, y: 45 },
          ],
        },
      ],
    ]);
    wrapper.unmount();
  });

  it('previews and commits a two-dimensional translation for one active Quad edge', async () => {
    const wrapper = await mountReadyImage({ quadInteractionCapabilities: DIRECT_QUAD_INTERACTION });
    wrapper.vm.resetQuadsArray([QUAD], 1);
    wrapper.vm.redrawQuadOverlay();
    await nextTick();

    const handle = wrapper.findAll('.quad-edge-handle')[0];
    const startX = Number.parseFloat(handle.element.style.left);
    const startY = Number.parseFloat(handle.element.style.top);
    await handle.trigger('pointerdown', { button: 0, pointerId: 11, clientX: startX, clientY: startY });
    await handle.trigger('pointermove', { pointerId: 11, clientX: startX + 20, clientY: startY + 10 });
    await handle.trigger('pointerup', { pointerId: 11, clientX: startX + 20, clientY: startY + 10 });

    expect(wrapper.emitted('quad-translation-start')).toEqual([
      [{ quadIndex: 0, target: { type: QUAD_TRANSLATION_TARGET.EDGE, edgeIndex: 0 } }],
    ]);
    expect(wrapper.emitted('commit-quad-translation')).toEqual([
      [
        {
          quadIndex: 0,
          target: { type: QUAD_TRANSLATION_TARGET.EDGE, edgeIndex: 0 },
          imageDelta: { x: 10, y: 5 },
          imagePoints: [
            { x: 20, y: 15 },
            { x: 50, y: 15 },
            { x: 40, y: 40 },
            { x: 10, y: 40 },
          ],
        },
      ],
    ]);
    wrapper.unmount();
  });

  it('restores an edge preview when direct editing is turned off', async () => {
    const wrapper = await mountReadyImage();
    wrapper.vm.resetQuadsArray([QUAD], 1);
    wrapper.vm.redrawQuadOverlay();
    await nextTick();

    let handle = wrapper.findAll('.quad-edge-handle')[0];
    const startX = Number.parseFloat(handle.element.style.left);
    const startY = Number.parseFloat(handle.element.style.top);
    await handle.trigger('pointerdown', { button: 0, pointerId: 12, clientX: startX, clientY: startY });
    await handle.trigger('pointermove', { pointerId: 12, clientX: startX + 20, clientY: startY + 10 });
    await wrapper.setProps({ quadInteractionCapabilities: DEFAULT_QUAD_INTERACTION });
    await nextTick();

    expect(wrapper.find('.quad-edge-handle').exists()).toBe(false);
    expect(wrapper.emitted('commit-quad-translation')).toBeUndefined();
    expect(wrapper.emitted('quad-translation-cancel')?.at(-1)).toEqual([
      {
        quadIndex: 0,
        target: { type: QUAD_TRANSLATION_TARGET.EDGE, edgeIndex: 0 },
        reason: 'interaction-mode-changed',
      },
    ]);

    await wrapper.setProps({ quadInteractionCapabilities: DIRECT_QUAD_INTERACTION });
    await nextTick();
    handle = wrapper.findAll('.quad-edge-handle')[0];
    expect(Number.parseFloat(handle.element.style.left)).toBe(startX);
    expect(Number.parseFloat(handle.element.style.top)).toBe(startY);
    wrapper.unmount();
  });

  it('restores the Quad preview when whole-Quad translation is canceled with Escape', async () => {
    const wrapper = await mountReadyImage();
    wrapper.vm.resetQuadsArray([QUAD], 1);
    wrapper.vm.redrawQuadOverlay();
    await nextTick();

    let handle = wrapper.find('.quad-translate-handle');
    const startX = Number.parseFloat(handle.element.style.left);
    const startY = Number.parseFloat(handle.element.style.top);
    await handle.trigger('pointerdown', { button: 0, pointerId: 9, clientX: startX, clientY: startY });
    await handle.trigger('pointermove', { pointerId: 9, clientX: startX + 20, clientY: startY + 10 });
    const escapeEvent = dispatchEscapeFromDocument();
    await nextTick();

    handle = wrapper.find('.quad-translate-handle');
    expect(Number.parseFloat(handle.element.style.left)).toBe(startX);
    expect(Number.parseFloat(handle.element.style.top)).toBe(startY);
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(wrapper.emitted('commit-quad-translation')).toBeUndefined();
    expect(wrapper.emitted('quad-translation-cancel')?.at(-1)).toEqual([
      { quadIndex: 0, target: { type: QUAD_TRANSLATION_TARGET.WHOLE }, reason: 'escape' },
    ]);
    wrapper.unmount();
  });

  it('restores an edge preview when edge translation is canceled with Escape', async () => {
    const wrapper = await mountReadyImage();
    wrapper.vm.resetQuadsArray([QUAD], 1);
    wrapper.vm.redrawQuadOverlay();
    await nextTick();

    let handle = wrapper.findAll('.quad-edge-handle')[0];
    const startX = Number.parseFloat(handle.element.style.left);
    const startY = Number.parseFloat(handle.element.style.top);
    await handle.trigger('pointerdown', { button: 0, pointerId: 13, clientX: startX, clientY: startY });
    await handle.trigger('pointermove', { pointerId: 13, clientX: startX + 20, clientY: startY + 10 });
    const escapeEvent = dispatchEscapeFromDocument();
    await nextTick();

    handle = wrapper.findAll('.quad-edge-handle')[0];
    expect(Number.parseFloat(handle.element.style.left)).toBe(startX);
    expect(Number.parseFloat(handle.element.style.top)).toBe(startY);
    expect(escapeEvent.defaultPrevented).toBe(true);
    expect(wrapper.emitted('commit-quad-translation')).toBeUndefined();
    expect(wrapper.emitted('quad-translation-cancel')?.at(-1)).toEqual([
      { quadIndex: 0, target: { type: QUAD_TRANSLATION_TARGET.EDGE, edgeIndex: 0 }, reason: 'escape' },
    ]);
    wrapper.unmount();
  });

  it('activates the sole Quad under the mouse when hover activation is enabled', async () => {
    const wrapper = await mountReadyImage({
      activeQuadIndex: -1,
      quadInteractionCapabilities: DIRECT_QUAD_INTERACTION,
    });
    wrapper.vm.resetQuadsArray([QUAD], 1);
    wrapper.vm.addShowQuadIndex(0);
    wrapper.vm.redrawQuadOverlay();

    await wrapper.find('.image-container').trigger('mouseenter', { clientX: 60, clientY: 60 });
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 61, clientY: 61 }));
    await nextTick();

    expect(wrapper.emitted('select-quad-index')?.at(-1)).toEqual([0]);
    wrapper.unmount();
  });
});

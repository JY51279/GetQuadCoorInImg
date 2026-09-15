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

async function mountReadyImage(overrides = {}) {
  const wrapper = mount(ImageView, {
    attachTo: document.body,
    props: {
      imageObj: {
        src: 'prepared-image',
        width: 100,
        height: 100,
        naturalWidth: 100,
        naturalHeight: 100,
      },
      canEdit: true,
      canInteract: true,
      activeQuadIndex: 0,
      selectedDots: [],
      quadInteractionCapabilities: DIRECT_QUAD_INTERACTION,
      ...overrides,
    },
  });
  expect(await wrapper.vm.initImgInfo()).toBe(true);
  await nextTick();
  return wrapper;
}

describe('ImageView interactions', () => {
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
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await nextTick();

    handle = wrapper.find('.quad-translate-handle');
    expect(Number.parseFloat(handle.element.style.left)).toBe(startX);
    expect(Number.parseFloat(handle.element.style.top)).toBe(startY);
    expect(wrapper.emitted('commit-quad-translation')).toBeUndefined();
    expect(wrapper.emitted('quad-translation-cancel')?.at(-1)).toEqual([
      { quadIndex: 0, target: { type: QUAD_TRANSLATION_TARGET.WHOLE }, reason: 'escape' },
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

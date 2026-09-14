/* @vitest-environment jsdom */
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ImageView from '../src/renderer/src/components/ImageView.vue';

const QUAD = [
  { x: 10, y: 10 },
  { x: 40, y: 10 },
  { x: 40, y: 40 },
  { x: 10, y: 40 },
];

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

  it('activates the sole Quad under the mouse when hover activation is enabled', async () => {
    const wrapper = await mountReadyImage({ activeQuadIndex: -1, hoverQuadActivationEnabled: true });
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

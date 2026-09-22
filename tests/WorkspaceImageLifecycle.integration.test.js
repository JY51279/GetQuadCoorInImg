/* @vitest-environment jsdom */
import { flushPromises, mount, shallowMount } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import * as dataset from '../src/renderer/src/state/DatasetState.js';
import { loadRendererImage } from '../src/renderer/src/utils/RendererImageLoader.js';
import { createJsonResponse, createPicture } from './fixtures/DatasetFixtures.js';
import ImageView from '../src/renderer/src/components/ImageView.vue';

vi.mock('../src/renderer/src/utils/RendererImageLoader.js', () => ({ loadRendererImage: vi.fn() }));

const ipcRenderer = { invoke: vi.fn() };
const present = vi.fn();
const ImageViewStub = defineComponent({
  name: 'ImageView',
  props: ['canEdit', 'canInteract', 'isLoading', 'imageLoadError', 'selectedDots'],
  methods: { presentImageSession: session => present(session) },
  render: () => h('div'),
});
let WindowProcess;
let wrapper;
let prepareImage;
let save;
const paths = ['C:/images/one.png', 'C:/images/two.png'];

function response(request, overrides = {}) {
  return {
    requestId: request.requestId,
    success: true,
    imageInfo: {
      url: 'prepared',
      path: request.imagePath || paths[0],
      fileName: (request.imagePath || paths[0]).split('/').at(-1),
      originalWidth: 100,
      originalHeight: 100,
      displayWidth: 100,
      displayHeight: 100,
      coordinateScaleX: 1,
      coordinateScaleY: 1,
      ...overrides,
    },
  };
}

beforeAll(async () => {
  Object.defineProperty(window, 'electron', { configurable: true, value: { ipcRenderer } });
  WindowProcess = (await import('../src/renderer/src/components/WindowProcess.vue')).default;
});

async function mountWorkspace() {
  wrapper = shallowMount(WindowProcess, {
    attachTo: document.body,
    global: { stubs: { WorkspaceToolbar: false, DatasetInfoPanel: false, ImageView: ImageViewStub } },
  });
  await flushPromises();
  return wrapper.findComponent(ImageViewStub);
}

function button(title) {
  return wrapper.find(`button[title="${title}"]`);
}
function imageRecords() {
  return ipcRenderer.invoke.mock.calls.filter(([channel]) => channel === 'record-workspace-image');
}
function presentedImages() {
  return present.mock.calls.map(([session]) => session).filter(Boolean);
}

describe('Workspace image session lifecycle', () => {
  it('loads, edits and switches images through the real parent/canvas lifecycle boundary', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(200);
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function () {
      const context = { canvas: this };
      for (const method of [
        'clearRect',
        'setTransform',
        'beginPath',
        'clip',
        'closePath',
        'drawImage',
        'fill',
        'fillRect',
        'lineTo',
        'moveTo',
        'restore',
        'save',
        'setLineDash',
        'stroke',
        'strokeRect',
      ])
        context[method] = vi.fn();
      return context;
    });
    vi.stubGlobal('requestAnimationFrame', callback => {
      queueMicrotask(callback);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
    wrapper = mount(WindowProcess, { attachTo: document.body, global: { stubs: { JsonView: true } } });
    await flushPromises();
    const view = wrapper.findComponent(ImageView);
    expect(view.props()).toMatchObject({ canEdit: true, canInteract: true });
    const canvas = view.find('canvas');
    await canvas.trigger('pointerdown', { button: 0, pointerId: 1, clientX: 80, clientY: 80 });
    await canvas.trigger('pointerup', { pointerId: 1, clientX: 80, clientY: 80 });
    await canvas.trigger('click', { clientX: 80, clientY: 80 });
    expect(view.props('selectedDots')).toEqual([{ x: 40, y: 40 }]);
    expect(imageRecords()).toHaveLength(1);
    await button('下一张图片（D / →）').trigger('click');
    await flushPromises();
    expect(view.props()).toMatchObject({ canEdit: true, canInteract: true, selectedDots: [] });
    expect(dataset.getCurrentJsonImageIndex()).toBe(1);
    expect(imageRecords()).toHaveLength(2);
    expect(view.find('.empty-image-state').exists()).toBe(false);
  });

  beforeEach(() => {
    present.mockReset().mockReturnValue(true);
    loadRendererImage.mockReset().mockResolvedValue({ src: 'prepared', naturalWidth: 100, naturalHeight: 100 });
    prepareImage = vi.fn(async request => response(request));
    save = vi.fn(async () => ({ success: true }));
    ipcRenderer.invoke.mockReset().mockImplementation(async (channel, request) => {
      if (channel === 'get-workspace-session')
        return { success: true, session: { schemaVersion: 1, datasetPath: 'C:/datasets/sample.json' } };
      if (channel === 'read-json-file' || channel === 'open-json-file-dialog')
        return createJsonResponse(
          paths.map(path => createPicture('DBR', path, '10 10 20 10 20 20 10 20')),
          {
            requestId: request.requestId,
            path: 'C:/datasets/sample.json',
            fileName: 'sample.json',
          },
        );
      if (channel === 'resolve-json-image-paths') return { success: true, imagePaths: paths };
      if (channel.startsWith('record-workspace-')) return { success: true, changed: true, stale: false, session: null };
      if (channel === 'prepare-image' || channel === 'open-image-file-dialog') return prepareImage(request);
      if (channel === 'save-json-file') return save(request);
      throw new Error(`Unexpected channel: ${channel}`);
    });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), setTransform: vi.fn() });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([null, {}, { requestId: 999, success: true }])(
    'ends initial loading after malformed current responses (R03): %j',
    async malformed => {
      prepareImage.mockResolvedValue(malformed);
      const view = await mountWorkspace();
      expect(prepareImage).toHaveBeenCalledTimes(2);
      expect(view.props()).toMatchObject({ canEdit: false, canInteract: false, isLoading: false });
      expect(view.props('imageLoadError')).not.toBeNull();
      expect(wrapper.text()).toContain('图集已加载');
      expect(button('手动匹配图片（Ctrl+I）').attributes('disabled')).toBeUndefined();
      expect(presentedImages()).toHaveLength(0);
      expect(imageRecords()).toHaveLength(0);
      expect(dataset.getCurrentJsonImageIndex()).toBe(-1);
    },
  );

  it('restores the previous editable session after all next-image candidates fail', async () => {
    const view = await mountWorkspace();
    const first = presentedImages()[0];
    prepareImage.mockResolvedValue(null);
    await button('下一张图片（D / →）').trigger('click');
    await flushPromises();
    expect(view.props()).toMatchObject({ canEdit: true, canInteract: true, isLoading: false, imageLoadError: null });
    expect(presentedImages()).toEqual([first]);
    expect(dataset.getCurrentJsonImageIndex()).toBe(0);
    expect(imageRecords()).toHaveLength(1);
  });

  it('keeps the selected points and session when manual image selection is canceled', async () => {
    const view = await mountWorkspace();
    view.vm.$emit('update-selected-dots', [{ x: 1, y: 2 }]);
    prepareImage.mockImplementation(async request => ({ requestId: request.requestId, canceled: true }));
    await button('手动匹配图片（Ctrl+I）').trigger('click');
    await flushPromises();
    expect(view.props()).toMatchObject({ canEdit: true, isLoading: false, selectedDots: [{ x: 1, y: 2 }] });
    expect(presentedImages()).toHaveLength(1);
    expect(imageRecords()).toHaveLength(1);
  });

  it('restores the old session when presenting the new image fails', async () => {
    const view = await mountWorkspace();
    const first = presentedImages()[0];
    vi.spyOn(console, 'error').mockImplementation(() => {});
    present.mockImplementation(session => session?.path !== paths[1]);
    await button('下一张图片（D / →）').trigger('click');
    await flushPromises();
    expect(presentedImages().at(-1)).toMatchObject(first);
    expect(view.props()).toMatchObject({ canEdit: true, isLoading: false });
    expect(dataset.getCurrentJsonImageIndex()).toBe(0);
    expect(imageRecords()).toHaveLength(1);
  });

  it('clears the session if presentation and restoration both fail', async () => {
    const view = await mountWorkspace();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    present.mockImplementation(session => session === null);
    await button('下一张图片（D / →）').trigger('click');
    await flushPromises();
    expect(view.props()).toMatchObject({ canEdit: false, canInteract: false, isLoading: false });
    expect(dataset.getCurrentJsonImageIndex()).toBe(-1);
    expect(present).toHaveBeenLastCalledWith(null);
    expect(imageRecords()).toHaveLength(1);
  });

  it('rejects incomplete coordinate metadata before replacing the displayed image', async () => {
    const view = await mountWorkspace();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    prepareImage.mockImplementation(async request => response(request, { originalWidth: undefined }));
    await button('下一张图片（D / →）').trigger('click');
    await flushPromises();
    expect(view.props()).toMatchObject({ canEdit: true, isLoading: false });
    expect(presentedImages()).toHaveLength(1);
    expect(dataset.getCurrentJsonImageIndex()).toBe(0);
  });

  it('displays an unmatched manual image without enabling edits or recording it as a checkpoint', async () => {
    const view = await mountWorkspace();
    prepareImage.mockImplementation(async request => response(request, { path: 'C:/images/unmatched.png' }));
    await button('手动匹配图片（Ctrl+I）').trigger('click');
    await flushPromises();
    expect(view.props()).toMatchObject({ canEdit: false, canInteract: true, isLoading: false });
    expect(presentedImages().at(-1).path).toBe('C:/images/unmatched.png');
    expect(imageRecords()).toHaveLength(1);
    expect(dataset.getCurrentJsonImageIndex()).toBe(-1);
  });

  it('ignores image decode completion after the workspace is unmounted', async () => {
    let resolve;
    loadRendererImage.mockImplementation(
      () =>
        new Promise(done => {
          resolve = done;
        }),
    );
    const view = await mountWorkspace();
    expect(view.props('isLoading')).toBe(true);
    wrapper.unmount();
    wrapper = null;
    resolve({ src: 'prepared', naturalWidth: 100, naturalHeight: 100 });
    await flushPromises();
    expect(presentedImages()).toHaveLength(0);
    expect(imageRecords()).toHaveLength(0);
    expect(dataset.getCurrentJsonImageIndex()).toBe(-1);
  });

  it('requires reload after failed rollback; navigating images cannot unlock editing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(dataset, 'rollbackDatasetMutation').mockReturnValueOnce({ success: false });
    const view = await mountWorkspace();
    save.mockResolvedValueOnce({ success: false, error: 'save failed' });
    view.vm.$emit('select-quad-index', 0);
    view.vm.$emit('commit-quad-point-drag', { quadIndex: 0, pointIndex: 1, imagePoint: { x: 22, y: 10 } });
    await flushPromises();
    expect(wrapper.text()).toContain('需要重新加载图集');
    expect(wrapper.findComponent({ name: 'JsonView' }).props('errorMessage')).toBe('JSON 状态不可用，请重新加载图集。');
    const failures = wrapper
      .findAll('.toast-message')
      .map(toast => toast.text())
      .filter(message => message.includes('保存 JSON 文件失败'));
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain('请重新加载图集');
    expect(view.props()).toMatchObject({ canEdit: false, canInteract: false });
    expect(button('下一张图片（D / →）').attributes('disabled')).toBeDefined();
    expect(button('手动匹配图片（Ctrl+I）').attributes('disabled')).toBeDefined();
    expect(present).toHaveBeenLastCalledWith(null);
    await wrapper.find('.toolbar-button.primary').trigger('click');
    await flushPromises();
    expect(view.props('canEdit')).toBe(true);
    expect(presentedImages().at(-1).datasetVersion).toBe(2);
  });
});

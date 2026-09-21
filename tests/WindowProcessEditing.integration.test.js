/* @vitest-environment jsdom */
import { flushPromises, shallowMount } from '@vue/test-utils';
import { defineComponent, h, nextTick } from 'vue';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getJsonFileInfo } from '../src/renderer/src/state/DatasetState.js';
import { createJsonResponse, createPicture } from './fixtures/DatasetFixtures.js';

vi.mock('../src/renderer/src/utils/RendererImageLoader.js', () => ({
  loadRendererImage: async () => ({ src: 'test-image', naturalWidth: 40, naturalHeight: 40 }),
}));

const ipcRenderer = { invoke: vi.fn() };
const ImageViewStub = defineComponent({
  name: 'ImageView',
  props: ['canEdit', 'activeQuadIndex'],
  methods: { presentImageSession: () => true },
  render: () => h('div'),
});
const JsonViewStub = defineComponent({
  name: 'JsonView',
  methods: { scrollToBottom: () => {} },
  render: () => h('div'),
});
let WindowProcess;
let wrapper;
let persist;

beforeAll(async () => {
  Object.defineProperty(window, 'electron', { configurable: true, value: { ipcRenderer } });
  WindowProcess = (await import('../src/renderer/src/components/WindowProcess.vue')).default;
});

async function mountEditor() {
  wrapper = shallowMount(WindowProcess, {
    attachTo: document.body,
    global: {
      stubs: { WorkspaceToolbar: false, DatasetInfoPanel: false, ImageView: ImageViewStub, JsonView: JsonViewStub },
    },
  });
  await flushPromises();
  const imageView = wrapper.findComponent(ImageViewStub);
  expect(imageView.props('canEdit')).toBe(true);
  imageView.vm.$emit('select-quad-index', 0);
  await nextTick();
  return imageView;
}

function button(title) {
  return wrapper.find(`button[title="${title}"]`);
}

function currentLocation() {
  return JSON.parse(getJsonFileInfo().str).Picture[0]['Barcode Info'][0]['Barcode Location'];
}

describe('Workspace editing through real domain and save transactions', () => {
  beforeEach(() => {
    persist = vi.fn(async () => ({ success: true }));
    ipcRenderer.invoke.mockImplementation(async (channel, request) => {
      if (channel === 'get-workspace-session') {
        return { success: true, session: { schemaVersion: 1, datasetPath: 'C:/datasets/sample.json' } };
      }
      if (channel === 'read-json-file') {
        return createJsonResponse([createPicture('DBR', 'C:/images/one.png', '10 10 20 10 20 20 10 20')], {
          requestId: request.requestId,
          path: request.filePath,
          fileName: 'sample.json',
        });
      }
      if (channel === 'resolve-json-image-paths') return { success: true, imagePaths: ['C:/images/one.png'] };
      if (channel.startsWith('record-workspace-')) return { success: true, changed: true, stale: false, session: null };
      if (channel === 'prepare-image') {
        return {
          requestId: request.requestId,
          success: true,
          imageInfo: {
            url: 'test-image',
            path: 'C:/images/one.png',
            fileName: 'one.png',
            originalWidth: 100,
            originalHeight: 100,
            displayWidth: 40,
            displayHeight: 40,
            coordinateScaleX: 0.4,
            coordinateScaleY: 0.4,
          },
        };
      }
      if (channel === 'save-json-file') return persist(request);
      throw new Error(`Unexpected IPC channel: ${channel}`);
    });
    vi.stubGlobal(
      'matchMedia',
      vi.fn(query => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ clearRect: vi.fn(), setTransform: vi.fn() });
  });

  afterEach(() => {
    wrapper?.unmount();
    wrapper = null;
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    ipcRenderer.invoke.mockReset();
  });

  it('rejects a three-point completion outside the original image without saving or recording history', async () => {
    const imageView = await mountEditor();
    const before = getJsonFileInfo();
    imageView.vm.$emit('update-selected-dots', [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: 0, y: 8 },
    ]);
    await button('更新当前 Quad（Ctrl+S）').trigger('click');
    await flushPromises();

    expect(getJsonFileInfo()).toEqual(before);
    expect(persist).not.toHaveBeenCalled();
    expect(button('撤销 JSON 操作（Ctrl+Shift+Z）').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('Quad 坐标超出当前图片边界。');
  });

  it('passes original dimensions to the point-drag command and skips a no-op', async () => {
    const imageView = await mountEditor();
    const before = getJsonFileInfo();
    imageView.vm.$emit('commit-quad-point-drag', { quadIndex: 0, pointIndex: 1, imagePoint: { x: 40, y: 4 } });
    await flushPromises();
    expect(getJsonFileInfo()).toEqual(before);
    expect(persist).not.toHaveBeenCalled();
    imageView.vm.$emit('commit-quad-point-drag', { quadIndex: 0, pointIndex: 1, imagePoint: { x: 8, y: 4 } });
    await flushPromises();
    expect(persist).not.toHaveBeenCalled();
    expect(button('撤销 JSON 操作（Ctrl+Shift+Z）').attributes('disabled')).toBeDefined();
  });

  it('uses symmetric delta rounding for successive opposite translations', async () => {
    const imageView = await mountEditor();
    const before = currentLocation();
    for (const x of [1, -1]) {
      imageView.vm.$emit('quad-translation-start', { quadIndex: 0 });
      imageView.vm.$emit('commit-quad-translation', {
        quadIndex: 0,
        target: { type: 'whole' },
        imageDelta: { x, y: 0 },
      });
      await flushPromises();
    }
    expect(persist).toHaveBeenCalledTimes(2);
    expect(JSON.parse(persist.mock.calls[0][0].str).Picture[0]['Barcode Info'][0]['Barcode Location']).toBe(
      '13 10 23 10 23 20 13 20',
    );
    expect(currentLocation()).toBe(before);
    expect(persist.mock.calls[1][0].str).toBe(getJsonFileInfo().str);
  });

  it('commits history only after save success and leaves undo/redo cursors unchanged after failure', async () => {
    const imageView = await mountEditor();
    const before = getJsonFileInfo();
    const emitEdit = () =>
      imageView.vm.$emit('commit-quad-point-drag', { quadIndex: 0, pointIndex: 1, imagePoint: { x: 7.6, y: 4.4 } });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    persist.mockResolvedValueOnce({ success: false, error: 'disk unavailable' });
    emitEdit();
    await flushPromises();
    expect(getJsonFileInfo()).toEqual(before);
    expect(button('撤销 JSON 操作（Ctrl+Shift+Z）').attributes('disabled')).toBeDefined();

    emitEdit();
    await flushPromises();
    const edited = getJsonFileInfo();
    expect(edited.str).not.toBe(before.str);
    expect(button('撤销 JSON 操作（Ctrl+Shift+Z）').attributes('disabled')).toBeUndefined();
    persist.mockResolvedValueOnce({ success: false, error: 'disk unavailable' });
    await button('撤销 JSON 操作（Ctrl+Shift+Z）').trigger('click');
    await flushPromises();
    expect(getJsonFileInfo()).toEqual(edited);
    expect(button('重做 JSON 操作（Ctrl+Shift+Y）').attributes('disabled')).toBeDefined();

    await button('撤销 JSON 操作（Ctrl+Shift+Z）').trigger('click');
    await flushPromises();
    expect(getJsonFileInfo()).toEqual(before);
    persist.mockResolvedValueOnce({ success: false, error: 'disk unavailable' });
    await button('重做 JSON 操作（Ctrl+Shift+Y）').trigger('click');
    await flushPromises();
    expect(getJsonFileInfo()).toEqual(before);
    expect(button('重做 JSON 操作（Ctrl+Shift+Y）').attributes('disabled')).toBeUndefined();
    await button('重做 JSON 操作（Ctrl+Shift+Y）').trigger('click');
    await flushPromises();
    expect(getJsonFileInfo()).toEqual(edited);
  });

  it('keeps zero-point placeholder creation and its undo/redo path', async () => {
    await mountEditor();
    const before = getJsonFileInfo();
    await button('新增 Quad（Ctrl+A）').trigger('click');
    await flushPromises();
    const added = getJsonFileInfo();
    expect(JSON.parse(added.str).Picture[0]['Barcode Info'][1]['Barcode Location']).toBe('0 0 0 0 0 0 0 0');
    await button('撤销 JSON 操作（Ctrl+Shift+Z）').trigger('click');
    await flushPromises();
    expect(getJsonFileInfo()).toEqual(before);
    await button('重做 JSON 操作（Ctrl+Shift+Y）').trigger('click');
    await flushPromises();
    expect(getJsonFileInfo()).toEqual(added);
  });

  describe.each(['point drag', 'translation'])('pending %s save after unmount', edit => {
    it.each([
      { outcome: 'success', response: { success: true } },
      { outcome: 'success with backup', response: { success: true, backupPath: 'C:/backups/sample.json' } },
      { outcome: 'failure', response: { success: false, error: 'disk unavailable' } },
      { outcome: 'IPC rejection', error: new Error('IPC unavailable') },
    ])('settles $outcome without reviving the disposed UI', async ({ response, error }) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const imageView = await mountEditor();
      const before = getJsonFileInfo();
      let resolveSave;
      let rejectSave;
      persist.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            resolveSave = resolve;
            rejectSave = reject;
          }),
      );

      if (edit === 'point drag') {
        imageView.vm.$emit('commit-quad-point-drag', { quadIndex: 0, pointIndex: 1, imagePoint: { x: 7.6, y: 4.4 } });
      } else {
        imageView.vm.$emit('quad-translation-start', { quadIndex: 0 });
        imageView.vm.$emit('commit-quad-translation', {
          quadIndex: 0,
          target: { type: 'whole' },
          imageDelta: { x: 1, y: 0 },
        });
      }
      await flushPromises();
      expect(persist).toHaveBeenCalledTimes(1);
      const edited = getJsonFileInfo();
      expect(edited.str).not.toBe(before.str);

      // Retain the disposed instance only to observe otherwise invisible late UI writes.
      const state = wrapper.vm.$.setupState;
      wrapper.unmount();
      wrapper = null;
      const annotationsAfterUnmount = state.annotationView;
      const selectionLockAfterUnmount = state.quadSelectionLockIndex;
      expect(vi.getTimerCount()).toBe(0);

      if (error) rejectSave(error);
      else resolveSave(response);
      await flushPromises();

      expect(getJsonFileInfo()).toEqual(response?.success ? edited : before);
      expect(state.annotationView).toBe(annotationsAfterUnmount);
      expect(state.quadSelectionLockIndex).toBe(selectionLockAfterUnmount);
      expect(state.canUndoJson).toBe(false);
      expect(state.notifications).toEqual([]);
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});

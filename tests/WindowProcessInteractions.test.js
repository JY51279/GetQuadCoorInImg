/* @vitest-environment jsdom */
import { flushPromises, shallowMount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATASET_FILE_STATUS } from '../src/shared/DatasetFileResponse.js';
import { createDbrPicture } from './fixtures/DatasetFixtures.js';

const ipcRenderer = {
  invoke: vi.fn(),
};

let WindowProcess;

beforeAll(async () => {
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: { ipcRenderer },
  });
  WindowProcess = (await import('../src/renderer/src/components/WindowProcess.vue')).default;
});

describe('WindowProcess interactions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'matchMedia',
      vi.fn(query => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      clearRect: vi.fn(),
      setTransform: vi.fn(),
    });
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows the current dataset name in the toolbar and opens the dataset page before the file dialog', async () => {
    ipcRenderer.invoke.mockImplementation(() => new Promise(() => {}));
    const wrapper = shallowMount(WindowProcess, { attachTo: document.body });
    await nextTick();

    const datasetTab = wrapper.find('button[aria-label="图集与图片"]');
    const annotationTab = wrapper.find('button[aria-label="Quad 标注"]');
    await annotationTab.trigger('click');
    expect(annotationTab.attributes('aria-pressed')).toBe('true');

    await wrapper.find('button[title="打开或更换图集（Ctrl+O）"]').trigger('click');
    await nextTick();

    expect(datasetTab.attributes('aria-pressed')).toBe('true');
    expect(annotationTab.attributes('aria-pressed')).toBe('false');
    expect(wrapper.find('.toolbar-dataset-name').text()).toBe('图集：未加载');
    expect(ipcRenderer.invoke).toHaveBeenCalledWith('open-json-file-dialog', { requestId: 1 });
    wrapper.unmount();
  });

  it('shows a dataset failure state with the attempted path', async () => {
    ipcRenderer.invoke.mockResolvedValue({
      requestId: 1,
      status: DATASET_FILE_STATUS.FAILED,
      target: { path: 'C:/datasets/broken.json', fileName: 'broken.json' },
      jsonInfo: null,
      error: '读取 JSON 文件失败。',
    });
    const wrapper = shallowMount(WindowProcess, { attachTo: document.body });

    await wrapper.find('button[title="打开或更换图集（Ctrl+O）"]').trigger('click');
    await flushPromises();
    await nextTick();

    const failure = wrapper.find('.dataset-load-error');
    expect(failure.exists()).toBe(true);
    expect(failure.text()).toContain('图集加载失败');
    expect(failure.text()).toContain('读取 JSON 文件失败。');
    expect(failure.text()).toContain('C:/datasets/broken.json');
    expect(wrapper.find('button[aria-label="图集与图片"]').attributes('aria-pressed')).toBe('true');
    wrapper.unmount();
  });

  it('navigates from a rejected dataset target instead of the last valid dataset', async () => {
    const adjacentRequests = [];
    ipcRenderer.invoke.mockImplementation(async (channel, request) => {
      if (channel === 'open-json-file-dialog') {
        return {
          requestId: request.requestId,
          status: DATASET_FILE_STATUS.READY,
          target: { path: 'C:/datasets/A.json', fileName: 'A.json' },
          jsonInfo: { str: JSON.stringify({ Picture: [createDbrPicture()] }) },
          error: '',
        };
      }
      if (channel === 'resolve-json-image-paths') {
        return { success: true, imagePaths: ['C:/datasets/images/one.png'] };
      }
      if (channel === 'prepare-image') {
        return {
          success: false,
          requestId: request.requestId,
          path: request.imagePath,
          error: '测试中不加载图片。',
        };
      }
      if (channel === 'open-adjacent-json-file') {
        adjacentRequests.push(request);
        if (adjacentRequests.length === 1) {
          return {
            requestId: request.requestId,
            status: DATASET_FILE_STATUS.READY,
            target: { path: 'C:/datasets/B.json', fileName: 'B.json' },
            jsonInfo: { str: '{"Picture":"invalid"}' },
            error: '',
          };
        }
        return {
          requestId: request.requestId,
          status: DATASET_FILE_STATUS.FAILED,
          target: null,
          jsonInfo: null,
          error: '停止测试导航。',
        };
      }
      throw new Error(`Unexpected IPC channel: ${channel}`);
    });
    const wrapper = shallowMount(WindowProcess, { attachTo: document.body });

    await wrapper.find('button[title="打开或更换图集（Ctrl+O）"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('.toolbar-dataset-name').text()).toBe('图集：A.json');

    await wrapper.find('button[title="下一图集（Shift+D / Shift+→）"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('.toolbar-dataset-name').text()).toBe('图集：B.json');
    expect(wrapper.find('.dataset-load-error').text()).toContain('当前图集C:/datasets/B.json');
    expect(wrapper.find('.metadata-list').text()).toContain('产品类型未加载');
    expect(wrapper.find('.metadata-list').text()).toContain('图片未加载');

    await wrapper.find('button[title="下一图集（Shift+D / Shift+→）"]').trigger('click');
    await flushPromises();
    await wrapper.find('button[title="上一图集（Shift+A / Shift+←）"]').trigger('click');
    await flushPromises();

    expect(adjacentRequests).toEqual([
      expect.objectContaining({ currentFilePath: 'C:/datasets/A.json', direction: 'next' }),
      expect.objectContaining({ currentFilePath: 'C:/datasets/B.json', direction: 'next' }),
      expect.objectContaining({ currentFilePath: 'C:/datasets/B.json', direction: 'previous' }),
    ]);
    wrapper.unmount();
  });
});

/* @vitest-environment jsdom */
import { flushPromises, shallowMount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
      success: false,
      requestId: 1,
      path: 'C:/datasets/broken.json',
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
});

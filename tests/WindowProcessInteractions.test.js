/* @vitest-environment jsdom */
import { shallowMount } from '@vue/test-utils';
import { nextTick } from 'vue';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const ipcRenderer = {
  invoke: vi.fn(),
  on: vi.fn(() => vi.fn()),
  send: vi.fn(),
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
    expect(ipcRenderer.send).toHaveBeenCalledWith('open-json-file-dialog', { requestId: 1 });
    wrapper.unmount();
  });
});

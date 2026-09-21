/* @vitest-environment jsdom */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import WorkspaceToolbar from '../src/renderer/src/components/WorkspaceToolbar.vue';
import DatasetInfoPanel from '../src/renderer/src/components/DatasetInfoPanel.vue';
import { KEYS } from '../src/renderer/src/utils/BasicFuncs.js';

function mountToolbar(overrides = {}) {
  return mount(WorkspaceToolbar, {
    props: {
      canLoadDataset: true,
      canNavigateDataset: true,
      canLoadImage: true,
      imagePositionView: { currentIndex: 0, total: 3 },
      jsonFileName: 'sample.json',
      jumpImageIndex: 1,
      ...overrides,
    },
  });
}

describe('Workspace presentation panels', () => {
  it('emits navigation intents without knowing IPC or workflow state', async () => {
    const wrapper = mountToolbar();
    try {
      const buttons = wrapper.findAll('button');
      for (const button of buttons) await button.trigger('click');
      expect(wrapper.emitted('open-dataset')).toEqual([[]]);
      expect(wrapper.emitted('navigate-dataset')).toEqual([[KEYS.PREVIOUS], [KEYS.NEXT]]);
      expect(wrapper.emitted('match-image')).toEqual([[]]);
      expect(wrapper.emitted('navigate-image')).toEqual([[KEYS.PREVIOUS], [KEYS.NEXT]]);
      expect(wrapper.emitted('jump-image')).toEqual([[]]);
      expect(wrapper.find('.toolbar-dataset-name').text()).toBe('图集：sample.json');
    } finally {
      wrapper.unmount();
    }
  });

  it('disables unavailable actions and image navigation for an empty dataset', async () => {
    const wrapper = mountToolbar({ canLoadDataset: false, canNavigateDataset: false, canLoadImage: false });
    try {
      for (const button of wrapper.findAll('button')) {
        expect(button.attributes('disabled')).toBeDefined();
        await button.trigger('click');
      }
      expect(wrapper.emitted('open-dataset')).toBeUndefined();
      expect(wrapper.emitted('navigate-image')).toBeUndefined();
      await wrapper.setProps({ canLoadImage: true, imagePositionView: { currentIndex: -1, total: 0 } });
      expect(wrapper.find('input').attributes('disabled')).toBeDefined();
      expect(wrapper.find('button[title="手动匹配图片（Ctrl+I）"]').attributes('disabled')).toBeDefined();
    } finally {
      wrapper.unmount();
    }
  });

  it('updates the jump model and ignores a held Enter key', async () => {
    const wrapper = mountToolbar();
    try {
      const input = wrapper.find('input');
      await input.setValue('3');
      expect(wrapper.emitted('update:jumpImageIndex')).toEqual([[3]]);
      await input.trigger('keydown', { key: 'Enter', repeat: true });
      expect(wrapper.emitted('jump-image')).toBeUndefined();
      await input.trigger('keydown', { key: 'Enter', repeat: false });
      expect(wrapper.emitted('jump-image')).toEqual([[]]);
      await wrapper.setProps({ jumpImageIndex: 2 });
      expect(input.element.value).toBe('2');
    } finally {
      wrapper.unmount();
    }
  });

  it('renders dataset failure and metadata from props without retaining stale values', async () => {
    const wrapper = mount(DatasetInfoPanel, {
      props: { loadedProductType: 'DBR', jsonFileName: 'one.json', imgFileName: 'one.png' },
    });
    try {
      expect(wrapper.find('[role="alert"]').exists()).toBe(false);
      expect(wrapper.find('.metadata-list').text()).toContain('one.png');
      await wrapper.setProps({
        loadedProductType: '',
        jsonFileName: 'broken.json',
        imgFileName: '',
        datasetLoadError: { path: 'C:/broken.json', message: '测试读取失败。' },
      });
      expect(wrapper.find('[role="alert"]').text()).toContain('C:/broken.json');
      expect(wrapper.find('.metadata-list').text()).toContain('图片未加载');
      expect(wrapper.text()).not.toContain('one.png');
    } finally {
      wrapper.unmount();
    }
  });
});

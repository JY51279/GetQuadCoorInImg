/* @vitest-environment jsdom */
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import WorkspaceToolbar from '../src/renderer/src/components/WorkspaceToolbar.vue';
import DatasetInfoPanel from '../src/renderer/src/components/DatasetInfoPanel.vue';
import QuadAnnotationPanel from '../src/renderer/src/components/QuadAnnotationPanel.vue';
import DisplaySettingsPanel from '../src/renderer/src/components/DisplaySettingsPanel.vue';
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

  it('presents Quad annotation state and emits editing intents', async () => {
    const wrapper = mount(QuadAnnotationPanel, {
      props: {
        activeQuadIndex: 0,
        activeQuadLabel: '1 / 1',
        annotationView: { formattedItems: ['10 10 20 10 20 20 10 20'], errorMessage: '' },
        selectedDots: [{ x: 10, y: 20 }],
        canInteractWithImage: true,
        canUndoPoints: true,
        canApplyQuadLocationForward: true,
        canOperate: true,
      },
    });
    try {
      expect(wrapper.text()).toContain('Quad 1 / 1');
      expect(wrapper.text()).toContain('10, 20');
      expect(wrapper.vm.getZoomCanvas()).toBeInstanceOf(HTMLCanvasElement);

      await wrapper.find('button[title="进入 Quad 聚焦模式（F）"]').trigger('click');
      await wrapper.find('button[title="撤回选点（Ctrl+Z）"]').trigger('click');
      await wrapper.find('button[title="更新当前 Quad（Ctrl+S）"]').trigger('click');
      await wrapper.find('button[title="新增 Quad（Ctrl+A）"]').trigger('click');

      expect(wrapper.emitted('toggle-focus-mode')).toEqual([[]]);
      expect(wrapper.emitted('undo-point')).toEqual([[]]);
      expect(wrapper.emitted('modify-quad')).toEqual([[]]);
      expect(wrapper.emitted('add-quad')).toEqual([[]]);
    } finally {
      wrapper.unmount();
    }
  });

  it('owns the location propagation form without changing workspace state directly', async () => {
    const wrapper = mount(QuadAnnotationPanel, {
      props: {
        activeQuadIndex: 1,
        annotationView: { formattedItems: [], errorMessage: '' },
        isQuadLocationPropagationOpen: true,
        quadLocationPropagationCount: 2,
        effectivePropagationCount: 2,
        remainingFollowingImageCount: 3,
        canApplyQuadLocationForward: true,
        canSubmitLocationPropagation: true,
        canOperate: true,
      },
    });
    try {
      const input = wrapper.find('input[aria-label="应用到后续图片的张数"]');
      await input.setValue('3');
      await wrapper.find('form').trigger('submit');

      expect(wrapper.text()).toContain('应用 Quad 2 的坐标');
      expect(wrapper.emitted('update:quadLocationPropagationCount')).toEqual([[3]]);
      expect(wrapper.emitted('apply-location-forward')).toEqual([[]]);
    } finally {
      wrapper.unmount();
    }
  });

  it('renders display capabilities and emits view interaction intents', async () => {
    const wrapper = mount(DisplaySettingsPanel, {
      props: {
        canInteractWithImage: true,
        canFocusQuad: true,
        hasQuads: true,
      },
    });
    try {
      expect(wrapper.text()).toContain('观察 Quad；通过选点更新标注');
      for (const button of wrapper.findAll('button')) await button.trigger('click');

      expect(wrapper.emitted('toggle-quad-interaction')).toEqual([[]]);
      expect(wrapper.emitted('reset-position')).toEqual([[]]);
      expect(wrapper.emitted('toggle-active-quad-visibility')).toEqual([[]]);
      expect(wrapper.emitted('show-all-quads')).toEqual([[]]);
      expect(wrapper.emitted('hide-all-quads')).toEqual([[]]);

      await wrapper.setProps({ isDirectQuadEditingEnabled: true });
      expect(wrapper.text()).toContain('悬停选择 Quad；可拖动 Quad 或顶点');
      expect(wrapper.find('.direct-edit-mode-button').attributes('aria-pressed')).toBe('true');
    } finally {
      wrapper.unmount();
    }
  });

  it('disables display actions when image interaction is unavailable', () => {
    const wrapper = mount(DisplaySettingsPanel);
    try {
      for (const button of wrapper.findAll('button')) {
        expect(button.attributes('disabled')).toBeDefined();
      }
    } finally {
      wrapper.unmount();
    }
  });
});

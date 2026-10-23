/* @vitest-environment jsdom */
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import ImageAnnotationPanel from '../src/renderer/src/components/ImageAnnotationPanel.vue';

const mounted = [];

function mountPanel(props = {}) {
  const wrapper = mount(ImageAnnotationPanel, {
    attachTo: document.body,
    props: {
      modelValue: '左侧码区有反光。',
      status: '未提交修改',
      canInput: true,
      canSubmit: true,
      ...props,
    },
  });
  mounted.push(wrapper);
  return wrapper;
}

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

describe('Image annotation keyboard flow', () => {
  it('submits with Enter and exits the editor while keeping Shift+Enter and composition for text', async () => {
    const wrapper = mountPanel();
    const input = wrapper.find('textarea');
    expect(wrapper.vm.focusInput()).toBe(true);
    expect(document.activeElement).toBe(input.element);

    await input.trigger('compositionstart');
    await input.trigger('keydown', { key: 'Enter' });
    await input.trigger('compositionend');
    await input.trigger('keydown', { key: 'Enter', shiftKey: true });
    await input.trigger('keydown', { key: 'Enter', repeat: true });
    expect(wrapper.emitted('submit')).toBeUndefined();
    expect(document.activeElement).toBe(input.element);

    await input.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('submit')).toHaveLength(1);
    expect(document.activeElement).toBe(wrapper.element);

    expect(wrapper.vm.focusInput()).toBe(true);
    await input.trigger('keydown', { key: 'Escape' });
    expect(wrapper.emitted('submit')).toHaveLength(1);
    expect(document.activeElement).toBe(wrapper.element);
  });

  it('does not focus a disabled editor or submit empty input', async () => {
    const disabled = mountPanel({ canInput: false, canSubmit: false });
    expect(disabled.vm.focusInput()).toBe(false);

    const empty = mountPanel({ modelValue: '', canSubmit: false });
    expect(empty.vm.focusInput()).toBe(true);
    await empty.find('textarea').trigger('keydown', { key: 'Enter' });
    expect(empty.emitted('submit')).toBeUndefined();
    expect(document.activeElement).toBe(empty.find('textarea').element);
  });
});

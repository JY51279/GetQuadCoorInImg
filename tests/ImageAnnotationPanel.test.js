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

  it('focuses feedback without preselecting an option and submits an explicit answer or finish', async () => {
    const feedback = {
      text: '右码模糊',
      turns: [],
      questions: [
        {
          id: 'q1',
          purpose: 'refine',
          prompt: '能否确认模糊类型？',
          selection: 'single',
          options: [{ id: 'motion', label: '运动模糊' }],
        },
      ],
      answers: [{ questionId: 'q1', optionIds: [], text: '' }],
      message: '',
    };
    const wrapper = mountPanel({
      feedback,
      canInput: false,
      canSubmit: false,
      canRespond: true,
      canSubmitFeedback: false,
    });
    const option = wrapper.find('.feedback-option input');
    expect(wrapper.vm.focusInput()).toBe(true);
    expect(document.activeElement).toBe(option.element);
    expect(option.element.checked).toBe(false);
    await option.setValue(true);
    expect(wrapper.emitted('feedback-option')?.[0]?.[0]).toEqual({
      questionId: 'q1',
      optionId: 'motion',
      checked: true,
    });
    expect(wrapper.find('.feedback-actions button').attributes('disabled')).toBeDefined();

    await wrapper.setProps({
      feedback: { ...feedback, answers: [{ questionId: 'q1', optionIds: ['motion'], text: '' }] },
    });
    await wrapper.find('.feedback-clear').trigger('click');
    expect(wrapper.emitted('feedback-clear-options')?.[0]?.[0]).toBe('q1');

    await wrapper.setProps({ canSubmitFeedback: true });
    const answerText = wrapper.find('#annotation-feedback-text-q1');
    answerText.element.focus();
    await answerText.trigger('compositionstart');
    await answerText.trigger('keydown', { key: 'Enter' });
    await answerText.trigger('compositionend');
    await answerText.trigger('keydown', { key: 'Enter', shiftKey: true });
    expect(wrapper.emitted('submit-feedback')).toBeUndefined();
    await answerText.trigger('keydown', { key: 'Enter' });
    expect(wrapper.emitted('submit-feedback')?.[0]?.[0]).toBe(false);
    expect(document.activeElement).toBe(wrapper.element);

    await wrapper.findAll('.feedback-actions button')[1].trigger('click');
    expect(wrapper.emitted('submit-feedback')?.[1]?.[0]).toBe(true);
  });
});

import { effectScope, nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useImageAnnotations } from '../src/renderer/src/composables/useImageAnnotations.js';

const datasetPath = 'C:/data/A.json';
const question = (id, prompt) => ({
  id,
  purpose: 'refine',
  prompt,
  selection: 'single',
  options: [
    { id: 'motion', label: '运动模糊' },
    { id: 'keep', label: '保持原描述' },
  ],
});

function loadResponse(request, saved = null) {
  return {
    success: true,
    requestId: request.requestId,
    datasetPath,
    records: [
      { imageIndex: 0, imagePath: 'a.jpg', saved },
      { imageIndex: 1, imagePath: 'b.jpg', saved: null },
    ],
  };
}

describe('image annotation feedback flow', () => {
  it('shows the concrete save failure reason in the panel state and notification', async () => {
    const notify = vi.fn();
    const invoke = vi.fn((channel, request) =>
      channel === 'load-annotations'
        ? Promise.resolve(loadResponse(request))
        : Promise.resolve({
            success: false,
            requestId: request.requestId,
            datasetPath,
            imagePath: 'a.jpg',
            stage: 'save',
            error: '保存注解 CSV 失败。 文件正被其他程序占用。',
          }),
    );
    const scope = effectScope();
    const annotations = scope.run(() =>
      useImageAnnotations({ imageIndex: ref(0), canEdit: ref(true), invoke, notify }),
    );

    try {
      await annotations.open({ path: datasetPath, imagePaths: ['a.jpg', 'b.jpg'] });
      annotations.input.value = '玻璃幕墙立面。';
      await annotations.submit();

      expect(annotations.error.value).toBe('保存注解 CSV 失败。 文件正被其他程序占用。');
      expect(annotations.status.value).toBe('失败');
      expect(notify).toHaveBeenCalledWith('A.json · 第 1 张图片：保存注解 CSV 失败。 文件正被其他程序占用。');
    } finally {
      annotations.dispose();
      scope.stop();
    }
  });

  it('shows an actionable service message when the IPC request itself fails', async () => {
    const notify = vi.fn();
    const invoke = vi.fn((channel, request) =>
      channel === 'load-annotations'
        ? Promise.resolve(loadResponse(request))
        : Promise.reject(new Error('Error invoking remote method with internal details')),
    );
    const scope = effectScope();
    const annotations = scope.run(() =>
      useImageAnnotations({ imageIndex: ref(0), canEdit: ref(true), invoke, notify }),
    );

    try {
      await annotations.open({ path: datasetPath, imagePaths: ['a.jpg', 'b.jpg'] });
      annotations.input.value = '玻璃幕墙立面。';
      await annotations.submit();

      expect(annotations.error.value).toBe('无法调用注解服务，请重试；若仍失败，请重启应用。');
      expect(notify).toHaveBeenCalledWith('A.json · 第 1 张图片：无法调用注解服务，请重试；若仍失败，请重启应用。');
    } finally {
      annotations.dispose();
      scope.stop();
    }
  });

  it('keeps feedback with its image through navigation and sends the full history before saving', async () => {
    const imageIndex = ref(0);
    let resolveFirst;
    const firstResponse = new Promise(resolve => (resolveFirst = resolve));
    const requests = [];
    const notify = vi.fn();
    const invoke = vi.fn((channel, request) => {
      const clonedRequest = structuredClone(request);
      if (channel === 'load-annotations') return Promise.resolve(loadResponse(clonedRequest));
      requests.push(clonedRequest);
      if (requests.length === 1) return firstResponse;
      if (requests.length === 2) {
        return Promise.resolve({
          success: true,
          status: 'needs_feedback',
          questions: [question('q2', '左侧反光是否需要细化？')],
          requestId: request.requestId,
          datasetPath,
          imagePath: 'a.jpg',
        });
      }
      return Promise.resolve({
        success: true,
        status: 'final',
        completed: true,
        requestId: request.requestId,
        datasetPath,
        imagePath: 'a.jpg',
        record: {
          imageIndex: 0,
          imagePath: 'a.jpg',
          saved: { rawDescription: '右侧码区模糊。', annotation: '右侧码区存在运动模糊；左侧码区有反光。' },
        },
      });
    });
    const scope = effectScope();
    const annotations = scope.run(() => useImageAnnotations({ imageIndex, canEdit: ref(true), invoke, notify }));

    try {
      await annotations.open({ path: datasetPath, imagePaths: ['a.jpg', 'b.jpg'] });
      annotations.input.value = '右侧码区模糊。';
      const first = annotations.submit();
      imageIndex.value = 1;
      await nextTick();
      resolveFirst({
        success: true,
        status: 'needs_feedback',
        questions: [question('q1', '能否确认模糊类型？')],
        requestId: requests[0].requestId,
        datasetPath,
        imagePath: 'a.jpg',
      });
      await first;
      expect(annotations.feedback.value).toBeNull();

      imageIndex.value = 0;
      await nextTick();
      expect(annotations.status.value).toBe('待反馈');
      expect(annotations.input.value).toBe('右侧码区模糊。');
      expect(annotations.canInput.value).toBe(false);
      expect(annotations.canSubmitFeedback.value).toBe(false);
      annotations.setFeedbackOption('q1', 'motion', true);
      annotations.clearFeedbackOptions('q1');
      expect(annotations.canSubmitFeedback.value).toBe(false);
      annotations.setFeedbackOption('q1', 'motion', true);
      annotations.setFeedbackMessage('左侧码区也有反光。');
      await annotations.submitFeedback();
      expect(requests[1].feedbackTurns).toEqual([
        {
          questions: [question('q1', '能否确认模糊类型？')],
          answers: [{ questionId: 'q1', optionIds: ['motion'], text: '' }],
          message: '左侧码区也有反光。',
        },
      ]);
      expect(annotations.feedback.value.questions[0].id).toBe('q2');

      annotations.setFeedbackOption('q2', 'keep', true);
      await annotations.submitFeedback();
      expect(requests[2].text).toBe('右侧码区模糊。');
      expect(requests[2].feedbackTurns).toHaveLength(2);
      expect(requests[2].feedbackTurns[0]).toEqual(requests[1].feedbackTurns[0]);
      expect(annotations.feedback.value).toBeNull();
      expect(annotations.current.value.saved.annotation).toContain('运动模糊');
      expect(notify).toHaveBeenCalledWith(expect.stringContaining('注解已保存'));
    } finally {
      annotations.dispose();
      scope.stop();
    }
  });

  it('does not send an empty reply and treats explicit finish as a user reply without overwriting saved text', async () => {
    const requests = [];
    const saved = { rawDescription: '旧描述', annotation: '旧注解' };
    const invoke = vi.fn((channel, request) => {
      if (channel === 'load-annotations') return Promise.resolve(loadResponse(request, saved));
      requests.push(request);
      return Promise.resolve({
        success: true,
        status: requests.length === 1 ? 'needs_feedback' : 'final',
        ...(requests.length === 1
          ? { questions: [question('q1', '能否确认模糊类型？')] }
          : { completed: false, annotation: '' }),
        requestId: request.requestId,
        datasetPath,
        imagePath: 'a.jpg',
      });
    });
    const scope = effectScope();
    const annotations = scope.run(() =>
      useImageAnnotations({ imageIndex: ref(0), canEdit: ref(true), invoke, notify: vi.fn() }),
    );

    try {
      await annotations.open({ path: datasetPath, imagePaths: ['a.jpg', 'b.jpg'] });
      annotations.input.value = '右侧码区模糊。';
      await annotations.submit();
      expect(annotations.canSubmitFeedback.value).toBe(false);
      expect(annotations.submitFeedback()).toBeUndefined();
      expect(requests).toHaveLength(1);

      await annotations.submitFeedback(true);
      expect(requests[1].feedbackTurns[0]).toMatchObject({
        answers: [],
        message: '结束细化，请根据已确认的信息生成最终注解。',
      });
      expect(annotations.current.value.saved).toEqual(saved);
      expect(annotations.feedback.value).toBeNull();
      expect(annotations.status.value).toBe('未完成');
    } finally {
      annotations.dispose();
      scope.stop();
    }
  });
});

import { describe, expect, it, vi } from 'vitest';
import { normalizeAnnotation } from '../src/main/AnnotationService.js';

const question = {
  id: 'q1',
  purpose: 'refine',
  prompt: '能否确认模糊类型？',
  selection: 'single',
  options: [
    { id: 'motion', label: '运动模糊' },
    { id: 'keep', label: '保持原描述' },
  ],
};

function modelResponse(result) {
  return {
    ok: true,
    json: async () => ({
      choices: [{ finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(result) } }],
    }),
  };
}

describe('annotation feedback context', () => {
  it('sends the original description and each answered question without relying on model memory', async () => {
    const requests = [];
    const fetchImpl = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return modelResponse({ status: 'final', completed: true, annotation: '右侧码区存在运动模糊。' });
    };
    const feedbackTurns = [
      {
        questions: [question],
        answers: [{ questionId: 'q1', optionIds: ['motion'], text: '' }],
        message: '左侧码区也有局部反光。',
      },
      {
        questions: [{ ...question, id: 'q2', prompt: '反光是否需要进一步说明？' }],
        answers: [],
        message: '保持反光的原描述，不再细化。',
      },
    ];

    const result = await normalizeAnnotation('右侧码区模糊。', {
      appPath: process.cwd(),
      env: { DEEPSEEK_API_KEY: 'test-key' },
      fetchImpl,
      feedbackTurns,
    });

    expect(result).toMatchObject({ success: true, status: 'final', completed: true });
    expect(requests).toHaveLength(1);
    expect(requests[0].messages.map(message => message.role)).toEqual(['system', 'user']);
    expect(JSON.parse(requests[0].messages[1].content)).toEqual({
      originalDescription: '右侧码区模糊。',
      feedbackHistory: [
        {
          modelQuestions: [question],
          userAnswers: [{ questionId: 'q1', optionIds: ['motion'], text: '' }],
          userMessage: '左侧码区也有局部反光。',
        },
        {
          modelQuestions: feedbackTurns[1].questions,
          userAnswers: [],
          userMessage: '保持反光的原描述，不再细化。',
        },
      ],
    });
  });

  it('keeps the first request as plain text and rejects unanswered or mismatched feedback', async () => {
    const fetchImpl = vi.fn(async () => modelResponse({ status: 'needs_feedback', questions: [question] }));
    const options = { appPath: process.cwd(), env: { DEEPSEEK_API_KEY: 'test-key' }, fetchImpl };
    const first = await normalizeAnnotation('右侧码区模糊。', options);
    expect(first).toMatchObject({ success: true, status: 'needs_feedback', questions: [question] });
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).messages[1].content).toBe('右侧码区模糊。');

    for (const answers of [[], [{ questionId: 'q1', optionIds: ['other'], text: '' }]]) {
      const result = await normalizeAnnotation('右侧码区模糊。', {
        ...options,
        feedbackTurns: [{ questions: [question], answers, message: '' }],
      });
      expect(result).toMatchObject({ success: false, errorKind: 'invalid-request' });
    }
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});

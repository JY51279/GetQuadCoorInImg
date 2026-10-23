import { describe, expect, it, vi } from 'vitest';
import { normalizeAnnotation, normalizeVisualAnnotation } from '../src/main/AnnotationService.js';

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
    const firstMessages = JSON.parse(fetchImpl.mock.calls[0][1].body).messages;
    expect(firstMessages[0].content).toContain('# 图片注解生成与多轮反馈规则');
    expect(firstMessages[0].content).toContain('本次输入模式为文字入口');
    expect(firstMessages[1].content).toBe('右侧码区模糊。');

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

describe('visual annotation context', () => {
  it('resends the same mapped region images and complete feedback history on every request', async () => {
    const requests = [];
    const fetchImpl = async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return modelResponse(
        requests.length === 1
          ? { status: 'needs_feedback', questions: [question] }
          : { status: 'final', completed: true, annotation: '区域 1（左上）的码区存在模糊。' },
      );
    };
    const regions = [
      {
        regionIndex: 0,
        label: '区域 1（左上）',
        position: '左上',
        imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      },
      {
        regionIndex: 1,
        label: '区域 2（右下）',
        position: '右下',
        imageUrl: 'data:image/png;base64,iVBORw0KGgoAAA=',
      },
    ];
    const options = {
      appPath: process.cwd(),
      env: { DEEPSEEK_API_KEY: 'test-key' },
      fetchImpl,
    };

    await expect(normalizeVisualAnnotation(regions, options)).resolves.toMatchObject({
      success: true,
      status: 'needs_feedback',
    });
    const feedbackTurns = [
      {
        questions: [question],
        answers: [{ questionId: 'q1', optionIds: ['keep'], text: '' }],
        message: '按可见现象结束细化。',
      },
    ];
    await expect(normalizeVisualAnnotation(regions, { ...options, feedbackTurns })).resolves.toMatchObject({
      success: true,
      status: 'final',
      completed: true,
    });

    expect(requests).toHaveLength(2);
    for (const request of requests) {
      expect(request.messages[0].content).toContain('# 图片注解生成与多轮反馈规则');
      expect(request.messages[0].content).toContain('本次输入模式为图像入口');
      expect(request.messages[0].content).toContain('只依据本次请求附带的可见图像');
      expect(request.messages[0].content).not.toContain('只理解文字，不读取或分析图片');
      expect(request.messages[1].content.slice(1)).toEqual(
        regions.map(region => ({
          type: 'image_url',
          image_url: { url: region.imageUrl, detail: 'high' },
        })),
      );
    }
    expect(JSON.parse(requests[0].messages[1].content[0].text)).toEqual({
      inputSource: 'region_images',
      regionMapping: [
        { regionIndex: 0, label: '区域 1（左上）', position: '左上' },
        { regionIndex: 1, label: '区域 2（右下）', position: '右下' },
      ],
      feedbackHistory: [],
    });
    expect(JSON.parse(requests[1].messages[1].content[0].text).feedbackHistory).toEqual([
      {
        modelQuestions: [question],
        userAnswers: feedbackTurns[0].answers,
        userMessage: feedbackTurns[0].message,
      },
    ]);
  });

  it('rejects missing region mappings and invalid feedback before calling the model', async () => {
    const fetchImpl = vi.fn();
    const options = { appPath: process.cwd(), env: { DEEPSEEK_API_KEY: 'test-key' }, fetchImpl };
    await expect(normalizeVisualAnnotation([], options)).resolves.toMatchObject({
      success: false,
      errorKind: 'invalid-request',
    });
    await expect(
      normalizeVisualAnnotation(
        [
          {
            regionIndex: 0,
            label: '区域 1（左上）',
            position: '左上',
            imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
          },
        ],
        { ...options, feedbackTurns: [{ questions: [question], answers: [], message: '' }] },
      ),
    ).resolves.toMatchObject({ success: false, errorKind: 'invalid-request' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects an empty completed visual annotation instead of treating it as no abnormality', async () => {
    const regions = [
      {
        regionIndex: 0,
        label: '区域 1（左上）',
        position: '左上',
        imageUrl: 'data:image/png;base64,iVBORw0KGgo=',
      },
    ];
    const result = await normalizeVisualAnnotation(regions, {
      appPath: process.cwd(),
      env: { DEEPSEEK_API_KEY: 'test-key' },
      fetchImpl: async () => modelResponse({ status: 'final', completed: true, annotation: '' }),
    });

    expect(result).toMatchObject({
      success: false,
      errorKind: 'invalid-response',
      error: expect.stringContaining('视觉模型返回了空注解'),
    });
  });
});

describe('annotation service failures', () => {
  it.each([
    ['ENOTFOUND', '无法解析 DeepSeek 服务地址，请检查网络、DNS 和 DEEPSEEK_BASE_URL。'],
    ['ECONNREFUSED', 'DeepSeek 服务拒绝连接，请检查 DEEPSEEK_BASE_URL、代理或服务状态。'],
    ['UND_ERR_CONNECT_TIMEOUT', '连接 DeepSeek 超时，请检查网络后重试。'],
    ['CERT_HAS_EXPIRED', 'DeepSeek 服务证书已过期，请检查接口地址或系统时间。'],
  ])('explains transport error %s without exposing the raw request error', async (code, message) => {
    const fetchImpl = vi.fn(async () => {
      throw Object.assign(new Error('request with sensitive internal details'), { cause: { code } });
    });

    const result = await normalizeAnnotation('玻璃幕墙。', {
      appPath: process.cwd(),
      env: { DEEPSEEK_API_KEY: 'test-key' },
      fetchImpl,
    });

    expect(result).toMatchObject({ success: false, errorKind: 'transport', error: message });
  });

  it.each([
    [
      400,
      { error: { message: 'maximum context length exceeded', code: 'invalid_request_error' } },
      '提交给 DeepSeek 的注解上下文过长，请重新开始本条注解或缩短人工描述。',
    ],
    [
      400,
      { error: { message: 'requested model not found', code: 'model_not_found' } },
      'DeepSeek 模型不可用，请检查 DEEPSEEK_MODEL。',
    ],
    [
      409,
      { error: { message: 'request conflict', code: 'request_conflict' } },
      'DeepSeek 请求失败（HTTP 409），请检查接口配置后重试。 服务错误代码：request_conflict。',
    ],
  ])('explains provider failure HTTP %s from safe response fields', async (status, payload, message) => {
    const result = await normalizeAnnotation('玻璃幕墙。', {
      appPath: process.cwd(),
      env: { DEEPSEEK_API_KEY: 'test-key' },
      fetchImpl: async () => ({ ok: false, status, json: async () => payload }),
    });

    expect(result).toMatchObject({ success: false, error: message });
  });

  it('reports configuration failures before making a request', async () => {
    const fetchImpl = vi.fn();

    const result = await normalizeAnnotation('玻璃幕墙。', {
      appPath: process.cwd(),
      env: {},
      fetchImpl,
    });

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('DEEPSEEK_API_KEY'),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

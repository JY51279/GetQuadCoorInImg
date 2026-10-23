import { readAnnotationConfig, loadAnnotationRules } from './AnnotationConfig.js';
import { parseAnnotationResult } from '../shared/AnnotationResult.js';
import { isRecord, serviceFailure, SERVICE_ERROR_KIND } from '../shared/ServiceResult.js';

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 2048;
const INPUT_MODE_RULES = Object.freeze({
  text: '本次输入模式为文字入口。只依据人工原始描述及反馈，不读取或分析图片。',
  image: '本次输入模式为图像入口。只依据本次请求附带的可见图像、regionMapping 给定的区域方位及反馈判断。',
});

function hasExactKeys(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function rulesForInputMode(rules, mode) {
  return `${rules.trim()}\n\n## 本次输入模式\n\n${INPUT_MODE_RULES[mode]}`;
}

function validFeedbackTurns(turns) {
  if (!Array.isArray(turns)) return false;
  for (const turn of turns) {
    if (
      !isRecord(turn) ||
      !hasExactKeys(turn, ['questions', 'answers', 'message']) ||
      !Array.isArray(turn.answers) ||
      typeof turn.message !== 'string'
    )
      return false;
    try {
      parseAnnotationResult(JSON.stringify({ status: 'needs_feedback', questions: turn.questions }));
    } catch {
      return false;
    }
    const questionsById = new Map(turn.questions.map(question => [question.id, question]));
    const answeredIds = new Set();
    for (const answer of turn.answers) {
      if (
        !isRecord(answer) ||
        !hasExactKeys(answer, ['questionId', 'optionIds', 'text']) ||
        typeof answer.questionId !== 'string' ||
        !questionsById.has(answer.questionId) ||
        answeredIds.has(answer.questionId) ||
        !Array.isArray(answer.optionIds) ||
        typeof answer.text !== 'string' ||
        (!answer.optionIds.length && !answer.text.trim())
      )
        return false;
      answeredIds.add(answer.questionId);
      const question = questionsById.get(answer.questionId);
      const validOptionIds = new Set(question.options.map(option => option.id));
      if (
        (question.selection === 'single' && answer.optionIds.length > 1) ||
        new Set(answer.optionIds).size !== answer.optionIds.length ||
        answer.optionIds.some(id => typeof id !== 'string' || !validOptionIds.has(id))
      )
        return false;
    }
    if (!turn.answers.length && !turn.message.trim()) return false;
  }
  return true;
}

function annotationMessages(rules, text, feedbackTurns) {
  const content = feedbackTurns.length
    ? JSON.stringify({
        originalDescription: text,
        feedbackHistory: feedbackTurns.map(turn => ({
          modelQuestions: turn.questions,
          userAnswers: turn.answers,
          userMessage: turn.message,
        })),
      })
    : text;
  return [
    { role: 'system', content: rules },
    { role: 'user', content },
  ];
}

function visualAnnotationMessages(rules, regions, feedbackTurns) {
  const context = {
    inputSource: 'region_images',
    regionMapping: regions.map(({ regionIndex, label, position }) => ({ regionIndex, label, position })),
    feedbackHistory: feedbackTurns.map(turn => ({
      modelQuestions: turn.questions,
      userAnswers: turn.answers,
      userMessage: turn.message,
    })),
  };
  return [
    { role: 'system', content: rules },
    {
      role: 'user',
      content: [
        { type: 'text', text: JSON.stringify(context) },
        ...regions.map(region => ({
          type: 'image_url',
          image_url: { url: region.imageUrl, detail: 'high' },
        })),
      ],
    },
  ];
}

function validVisualRegions(regions) {
  return (
    Array.isArray(regions) &&
    regions.length > 0 &&
    regions.every(
      (region, index) =>
        isRecord(region) &&
        hasExactKeys(region, ['regionIndex', 'label', 'position', 'imageUrl']) &&
        region.regionIndex === index &&
        typeof region.label === 'string' &&
        region.label.trim() &&
        typeof region.position === 'string' &&
        region.position.trim() &&
        typeof region.imageUrl === 'string' &&
        /^data:image\/png;base64,[a-zA-Z0-9+/]+=*$/u.test(region.imageUrl),
    )
  );
}

function normalizeTokenUsage(usage) {
  if (!isRecord(usage)) return null;
  const count = value => (Number.isSafeInteger(value) && value >= 0 ? value : null);
  return {
    inputTokens: count(usage.prompt_tokens),
    outputTokens: count(usage.completion_tokens),
    cacheHitTokens: count(usage.prompt_cache_hit_tokens) ?? count(usage.prompt_tokens_details?.cached_tokens),
    cacheMissTokens: count(usage.prompt_cache_miss_tokens),
    totalTokens: count(usage.total_tokens),
  };
}

function providerErrorCode(payload) {
  const value = payload?.error?.code ?? payload?.error?.type;
  return typeof value === 'string' && /^[a-zA-Z0-9_.-]+$/u.test(value) ? value : '';
}

function httpErrorMessage(status, payload) {
  const providerMessage = typeof payload?.error?.message === 'string' ? payload.error.message : '';
  if (/context.{0,20}(length|token)|maximum.{0,20}token/iu.test(providerMessage)) {
    return '提交给 DeepSeek 的注解上下文过长，请重新开始本条注解或缩短人工描述。';
  }
  if (/model.{0,30}(not found|not exist|unavailable|invalid)/iu.test(providerMessage)) {
    return 'DeepSeek 模型不可用，请检查 DEEPSEEK_MODEL。';
  }
  if (/response[_ ]format|json.{0,20}(mode|format)/iu.test(providerMessage)) {
    return '当前 DeepSeek 模型不支持所需的 JSON 输出格式，请更换模型。';
  }
  switch (status) {
    case 400:
    case 422:
      return 'DeepSeek 请求参数无效，请检查模型名称及接口配置。';
    case 401:
      return 'DeepSeek 身份验证失败，请检查 DEEPSEEK_API_KEY。';
    case 402:
      return 'DeepSeek 账户余额不足，请检查账户余额。';
    case 403:
      return 'DeepSeek 拒绝访问，请检查账户和模型访问权限。';
    case 404:
      return 'DeepSeek 接口或模型不存在，请检查接口地址和模型名称。';
    case 429:
      return 'DeepSeek 请求过于频繁，请稍后重试。';
    default:
      break;
  }
  const message =
    status >= 500
      ? `DeepSeek 服务暂时不可用（HTTP ${status}），请稍后重试。`
      : `DeepSeek 请求失败（HTTP ${status}），请检查接口配置后重试。`;
  const code = providerErrorCode(payload);
  return code ? `${message} 服务错误代码：${code}。` : message;
}

function transportFailure(error, signal) {
  if (signal.aborted) {
    return serviceFailure(null, 'DeepSeek 请求超时（60 秒），请稍后重试。', SERVICE_ERROR_KIND.TRANSPORT);
  }
  const code = error?.code ?? error?.cause?.code;
  const message =
    {
      ENOTFOUND: '无法解析 DeepSeek 服务地址，请检查网络、DNS 和 DEEPSEEK_BASE_URL。',
      EAI_AGAIN: '暂时无法解析 DeepSeek 服务地址，请检查网络或稍后重试。',
      ECONNREFUSED: 'DeepSeek 服务拒绝连接，请检查 DEEPSEEK_BASE_URL、代理或服务状态。',
      ECONNRESET: '与 DeepSeek 的连接被中断，请检查网络后重试。',
      ETIMEDOUT: '连接 DeepSeek 超时，请检查网络后重试。',
      UND_ERR_CONNECT_TIMEOUT: '连接 DeepSeek 超时，请检查网络后重试。',
      UND_ERR_SOCKET: '与 DeepSeek 的连接被中断，请检查网络后重试。',
      CERT_HAS_EXPIRED: 'DeepSeek 服务证书已过期，请检查接口地址或系统时间。',
      DEPTH_ZERO_SELF_SIGNED_CERT: 'DeepSeek 服务使用了不受信任的自签名证书。',
      SELF_SIGNED_CERT_IN_CHAIN: 'DeepSeek 服务证书链包含不受信任的自签名证书。',
      UNABLE_TO_VERIFY_LEAF_SIGNATURE: '无法验证 DeepSeek 服务证书，请检查接口地址或代理设置。',
    }[code] ?? '无法完成 DeepSeek 请求，请检查网络、代理和接口地址后重试。';
  return serviceFailure(null, message, SERVICE_ERROR_KIND.TRANSPORT);
}

async function requestAnnotation(messages, { env, fetchImpl }) {
  let usage = null;
  try {
    const config = readAnnotationConfig(env);
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages,
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          temperature: 0.2,
          max_tokens: MAX_OUTPUT_TOKENS,
          stream: false,
        }),
        signal,
        redirect: 'error',
      });
    } catch (error) {
      // Never forward raw request errors: they may contain headers or text.
      return { ...transportFailure(error, signal), usage };
    }
    if (!response.ok) {
      let payload = null;
      try {
        payload = await response.json();
      } catch {
        await response.body?.cancel().catch(() => {});
      }
      return { ...serviceFailure(null, httpErrorMessage(response.status, payload)), usage };
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      const failure =
        !signal.aborted && error instanceof SyntaxError
          ? serviceFailure(null, 'DeepSeek 接口返回的内容不是有效的 JSON。', SERVICE_ERROR_KIND.INVALID_RESPONSE)
          : transportFailure(error, signal);
      return { ...failure, usage };
    }

    // Keep usage even when the model result fails validation. Missing counts
    // remain null, not zero. Logs contain only these numeric fields.
    usage = normalizeTokenUsage(payload?.usage);
    if (usage) console.info('Annotation token usage:', usage);

    const choice = Array.isArray(payload?.choices) && payload.choices.length === 1 ? payload.choices[0] : null;
    if (payload?.error || !isRecord(choice) || choice.message?.role !== 'assistant') {
      return {
        ...serviceFailure(null, 'DeepSeek 返回的消息结构无效。', SERVICE_ERROR_KIND.INVALID_RESPONSE),
        usage,
      };
    }
    if (choice.finish_reason !== 'stop') {
      const message =
        choice.finish_reason === 'length'
          ? '规范注解输出被截断，未完成生成；请缩短人工描述后重试。'
          : 'DeepSeek 未正常完成注解生成，请稍后重试。';
      return { ...serviceFailure(null, message, SERVICE_ERROR_KIND.INVALID_RESPONSE), usage };
    }

    try {
      return { success: true, ...parseAnnotationResult(choice.message.content), usage };
    } catch (error) {
      return { ...serviceFailure(error, '模型返回的注解无效。', SERVICE_ERROR_KIND.INVALID_RESPONSE), usage };
    }
  } catch (error) {
    return { ...serviceFailure(error, '无法准备图片注解请求，请检查本地配置与规则文件。'), usage };
  }
}

// This service runs in the main process. appPath is app.getAppPath(); fetchImpl
// permits local contract tests without a key or a paid API call.
export async function normalizeAnnotation(
  text,
  { appPath, feedbackTurns = [], env = process.env, fetchImpl = fetch } = {},
) {
  if (typeof text !== 'string' || !text.trim()) {
    return { ...serviceFailure(null, '请先输入人工描述。', SERVICE_ERROR_KIND.INVALID_REQUEST), usage: null };
  }
  if (!validFeedbackTurns(feedbackTurns)) {
    return {
      ...serviceFailure(null, '注解反馈记录无效，请重新开始本条注解。', SERVICE_ERROR_KIND.INVALID_REQUEST),
      usage: null,
    };
  }
  try {
    const rules = rulesForInputMode(await loadAnnotationRules(appPath), 'text');
    return requestAnnotation(annotationMessages(rules, text, feedbackTurns), { env, fetchImpl });
  } catch (error) {
    return {
      ...serviceFailure(error, '无法准备图片注解请求，请检查本地配置与规则文件。'),
      usage: null,
    };
  }
}

export async function normalizeVisualAnnotation(
  regions,
  { appPath, feedbackTurns = [], env = process.env, fetchImpl = fetch } = {},
) {
  if (!validVisualRegions(regions)) {
    return {
      ...serviceFailure(null, '码区局部图或区域对应关系无效，请重新生成局部图。', SERVICE_ERROR_KIND.INVALID_REQUEST),
      usage: null,
    };
  }
  if (!validFeedbackTurns(feedbackTurns)) {
    return {
      ...serviceFailure(null, '注解反馈记录无效，请重新开始本条注解。', SERVICE_ERROR_KIND.INVALID_REQUEST),
      usage: null,
    };
  }
  try {
    const rules = rulesForInputMode(await loadAnnotationRules(appPath), 'image');
    const result = await requestAnnotation(visualAnnotationMessages(rules, regions, feedbackTurns), { env, fetchImpl });
    if (result.success && result.status === 'final' && result.completed === true && !result.annotation.trim()) {
      return {
        ...serviceFailure(
          null,
          '视觉模型返回了空注解，无法确认所有码区均已检查；本次结果不会保存，请重试。',
          SERVICE_ERROR_KIND.INVALID_RESPONSE,
        ),
        usage: result.usage ?? null,
      };
    }
    return result;
  } catch (error) {
    return {
      ...serviceFailure(error, '无法准备视觉注解请求，请检查本地配置与视觉规则文件。'),
      usage: null,
    };
  }
}

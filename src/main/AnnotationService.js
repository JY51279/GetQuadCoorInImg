import { readAnnotationConfig, loadAnnotationRules } from './AnnotationConfig.js';
import { parseAnnotationResult } from '../shared/AnnotationResult.js';
import { isRecord, serviceFailure, SERVICE_ERROR_KIND } from '../shared/ServiceResult.js';

const REQUEST_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_TOKENS = 2048;

function hasExactKeys(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
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

function httpErrorMessage(status) {
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
      return status >= 500
        ? `DeepSeek 服务暂时不可用（HTTP ${status}），请稍后重试。`
        : `DeepSeek 请求失败（HTTP ${status}），请检查接口配置后重试。`;
  }
}

function transportFailure(signal) {
  return serviceFailure(
    null,
    signal.aborted ? 'DeepSeek 请求超时（60 秒），请稍后重试。' : '无法完成 DeepSeek 请求，请检查网络后重试。',
    SERVICE_ERROR_KIND.TRANSPORT,
  );
}

// This service runs in the main process. appPath is app.getAppPath(); the fetch
// dependency also permits a small local check without a key or a paid API call.
export async function normalizeAnnotation(
  text,
  { appPath, feedbackTurns = [], env = process.env, fetchImpl = fetch } = {},
) {
  let usage = null;
  if (typeof text !== 'string' || !text.trim()) {
    return { ...serviceFailure(null, '请先输入人工描述。', SERVICE_ERROR_KIND.INVALID_REQUEST), usage };
  }
  if (!validFeedbackTurns(feedbackTurns)) {
    return {
      ...serviceFailure(null, '注解反馈记录无效，请重新开始本条注解。', SERVICE_ERROR_KIND.INVALID_REQUEST),
      usage,
    };
  }

  try {
    const config = readAnnotationConfig(env);
    const rules = await loadAnnotationRules(appPath);
    const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    let response;
    try {
      response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages: annotationMessages(rules, text, feedbackTurns),
          response_format: { type: 'json_object' },
          thinking: { type: 'disabled' },
          temperature: 0.2,
          max_tokens: MAX_OUTPUT_TOKENS,
          stream: false,
        }),
        signal,
        redirect: 'error',
      });
    } catch {
      // Never forward raw request errors: they may contain headers or text.
      return { ...transportFailure(signal), usage };
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      return { ...serviceFailure(null, httpErrorMessage(response.status)), usage };
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      const failure =
        !signal.aborted && error instanceof SyntaxError
          ? serviceFailure(null, 'DeepSeek 接口返回的内容不是有效的 JSON。', SERVICE_ERROR_KIND.INVALID_RESPONSE)
          : transportFailure(signal);
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

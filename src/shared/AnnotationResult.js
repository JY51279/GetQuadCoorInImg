import { isRecord } from './ServiceResult.js';

function hasExactKeys(value, keys) {
  const actual = Object.keys(value);
  return actual.length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && Boolean(value.trim());
}

// Accept only the model message's JSON text. Transport errors and truncated
// responses must be rejected by the caller before reaching this parser.
export function parseAnnotationResult(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('模型返回了空响应，未完成注解。');
  }

  let result;
  try {
    result = JSON.parse(content);
  } catch {
    throw new Error('模型返回的注解不是有效的 JSON。');
  }
  if (!isRecord(result)) throw new Error('模型返回的注解结构无效。');

  if (result.status === 'needs_feedback') {
    if (
      !hasExactKeys(result, ['status', 'questions']) ||
      !Array.isArray(result.questions) ||
      !result.questions.length
    ) {
      throw new Error('模型返回的待反馈问题结构无效。');
    }
    const questionIds = new Set();
    for (const question of result.questions) {
      if (
        !isRecord(question) ||
        !hasExactKeys(question, ['id', 'purpose', 'prompt', 'selection', 'options']) ||
        !isNonEmptyString(question.id) ||
        !['clarify', 'refine'].includes(question.purpose) ||
        !isNonEmptyString(question.prompt) ||
        !['single', 'multiple'].includes(question.selection) ||
        !Array.isArray(question.options) ||
        !question.options.length ||
        questionIds.has(question.id)
      ) {
        throw new Error('模型返回的待反馈问题结构无效。');
      }
      questionIds.add(question.id);
      const optionIds = new Set();
      for (const option of question.options) {
        if (
          !isRecord(option) ||
          !hasExactKeys(option, ['id', 'label']) ||
          !isNonEmptyString(option.id) ||
          !isNonEmptyString(option.label) ||
          optionIds.has(option.id)
        ) {
          throw new Error('模型返回的待反馈选项结构无效。');
        }
        optionIds.add(option.id);
      }
    }
    return { status: 'needs_feedback', questions: result.questions };
  }

  if (
    result.status !== 'final' ||
    !hasExactKeys(result, ['status', 'completed', 'annotation']) ||
    typeof result.completed !== 'boolean' ||
    typeof result.annotation !== 'string' ||
    (!result.completed && result.annotation !== '')
  ) {
    throw new Error('模型返回的最终注解结构无效。');
  }

  // A completed empty annotation is valid; an incomplete final result is not
  // a transport error and must not be saved by the workflow.
  return { status: 'final', completed: result.completed, annotation: result.annotation };
}

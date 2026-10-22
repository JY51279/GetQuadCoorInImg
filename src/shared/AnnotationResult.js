import { isRecord } from './ServiceResult.js';

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
  if (!isRecord(result) || typeof result.completed !== 'boolean' || typeof result.annotation !== 'string') {
    throw new Error('模型返回的注解缺少必需字段或字段类型错误。');
  }
  if (!result.completed) throw new Error('模型未能完成文本规范化，请修改人工描述后重试。');

  // An explicitly empty annotation is a valid completed result. Keep it distinct
  // from a missing field or empty API response; persistence is a later step.
  return { completed: true, annotation: result.annotation };
}

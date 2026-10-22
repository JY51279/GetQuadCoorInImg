import { normalizeAnnotation } from './AnnotationService.js';
import {
  getAnnotationDatasetKey,
  loadAnnotations,
  resolveAnnotationDatasetPath,
  saveAnnotation,
} from './AnnotationStore.js';
import { isRecord, serviceFailure, SERVICE_ERROR_KIND } from '../shared/ServiceResult.js';

const pendingRecords = new Set();

export async function generateAndSaveAnnotation(request, { appPath, normalize = normalizeAnnotation } = {}) {
  if (
    !isRecord(request) ||
    typeof request.recordId !== 'string' ||
    !request.recordId ||
    typeof request.text !== 'string' ||
    !request.text.trim()
  ) {
    return serviceFailure(null, '请提供图片记录标识和非空人工描述。', SERVICE_ERROR_KIND.INVALID_REQUEST);
  }
  let datasetPath;
  try {
    datasetPath = resolveAnnotationDatasetPath(request.datasetPath);
  } catch (error) {
    return serviceFailure(error, '注解图集路径无效。', SERVICE_ERROR_KIND.INVALID_REQUEST);
  }
  const recordId = request.recordId;
  const text = request.text;
  const context = { datasetPath, recordId };
  const key = `${getAnnotationDatasetKey(datasetPath)}\0${recordId}`;
  if (pendingRecords.has(key))
    return { ...serviceFailure(null, '该图片记录正在生成或保存注解，请等待完成。'), ...context };
  pendingRecords.add(key);
  let usage = null;
  let stage = 'prepare';
  try {
    const snapshot = await loadAnnotations(datasetPath);
    if (!snapshot.records.some(record => record.recordId === recordId)) {
      throw new Error('请求对应的图片记录已变化，请重新加载图集后重试。');
    }
    stage = 'generate';
    const generated = await normalize(text, { appPath });
    usage = generated.usage ?? null;
    if (!generated.success) return { ...generated, ...context, stage };
    stage = 'save';
    const saved = await saveAnnotation(datasetPath, recordId, {
      completed: generated.completed,
      rawDescription: text,
      annotation: generated.annotation,
    });
    return { success: true, completed: true, ...context, ...saved, usage };
  } catch (error) {
    return {
      ...serviceFailure(error, stage === 'save' ? '保存注解 CSV 失败。' : '无法完成图片注解，请检查图集及配套 CSV。'),
      ...context,
      stage,
      usage,
    };
  } finally {
    pendingRecords.delete(key);
  }
}

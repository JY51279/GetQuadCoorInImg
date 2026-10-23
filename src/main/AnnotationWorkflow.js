import { normalizeAnnotation, normalizeVisualAnnotation } from './AnnotationService.js';
import { loadAnnotationRegionImages } from './ImageFileReader.js';
import {
  findAnnotationRecord,
  getAnnotationRecordKey,
  loadAnnotations,
  resolveAnnotationDatasetPath,
  saveAnnotation,
} from './AnnotationStore.js';
import { isFilePath, isRecord, serviceFailure, SERVICE_ERROR_KIND } from '../shared/ServiceResult.js';
import { ANNOTATION_INPUT_SOURCE } from '../shared/AnnotationInputSource.js';

const pendingRecords = new Set();

export async function generateAndSaveAnnotation(
  request,
  {
    appPath,
    normalize = normalizeAnnotation,
    normalizeVisual = normalizeVisualAnnotation,
    loadRegions = loadAnnotationRegionImages,
    onStage,
  } = {},
) {
  const inputSource = request?.inputSource ?? ANNOTATION_INPUT_SOURCE.TEXT;
  const isTextInput = inputSource === ANNOTATION_INPUT_SOURCE.TEXT;
  const isImageInput = inputSource === ANNOTATION_INPUT_SOURCE.IMAGE;
  if (
    !isRecord(request) ||
    !isFilePath(request.imagePath) ||
    (!isTextInput && !isImageInput) ||
    (isTextInput && (typeof request.text !== 'string' || !request.text.trim())) ||
    (isImageInput && (!Array.isArray(request.regions) || request.regions.length === 0))
  ) {
    return serviceFailure(null, '请提供图片路径及有效的文字或图像输入。', SERVICE_ERROR_KIND.INVALID_REQUEST);
  }
  let datasetPath;
  try {
    datasetPath = resolveAnnotationDatasetPath(request.datasetPath);
  } catch (error) {
    return serviceFailure(error, '注解图集路径无效。', SERVICE_ERROR_KIND.INVALID_REQUEST);
  }
  const imagePath = request.imagePath;
  const text = isTextInput ? request.text : '';
  const context = { datasetPath, imagePath };
  const key = getAnnotationRecordKey(datasetPath, imagePath);
  if (pendingRecords.has(key))
    return { ...serviceFailure(null, '该图片记录正在生成或保存注解，请等待完成。'), ...context };
  pendingRecords.add(key);
  let usage = null;
  let stage = 'prepare';
  const reportStage = () => {
    // A closed renderer must not interrupt a valid save.
    try {
      onStage?.({ ...context, stage });
    } catch {
      /* Presentation only. */
    }
  };
  try {
    const snapshot = await loadAnnotations(datasetPath);
    if (!findAnnotationRecord(snapshot, imagePath)) {
      throw new Error('请求对应的图片已不在当前图集中，请重新加载图集后重试。');
    }
    stage = 'generate';
    reportStage();
    const generated = isImageInput
      ? await normalizeVisual(await loadRegions(request.regions), {
          appPath,
          feedbackTurns: request.feedbackTurns,
        })
      : await normalize(text, { appPath, feedbackTurns: request.feedbackTurns });
    usage = generated.usage ?? null;
    if (!generated.success) return { ...generated, ...context, stage };
    if (generated.status === 'needs_feedback' && Array.isArray(generated.questions) && generated.questions.length) {
      return { success: true, status: 'needs_feedback', questions: generated.questions, ...context, stage, usage };
    }
    if (
      generated.status !== 'final' ||
      typeof generated.completed !== 'boolean' ||
      typeof generated.annotation !== 'string' ||
      (!generated.completed && generated.annotation !== '')
    ) {
      return {
        ...serviceFailure(null, '模型返回的注解状态无效。', SERVICE_ERROR_KIND.INVALID_RESPONSE),
        ...context,
        stage,
        usage,
      };
    }
    if (!generated.completed) {
      return { success: true, status: 'final', completed: false, annotation: '', ...context, stage, usage };
    }
    stage = 'save';
    reportStage();
    const saved = await saveAnnotation(datasetPath, imagePath, {
      completed: generated.completed,
      inputSource,
      rawDescription: text,
      annotation: generated.annotation,
    });
    return { success: true, status: 'final', completed: true, ...context, ...saved, usage };
  } catch (error) {
    const fallback = {
      prepare: '读取图集及注解 CSV 失败。',
      generate: '生成注解失败，请重试；若仍失败，请检查模型服务配置。',
      save: '保存注解 CSV 失败。',
    }[stage];
    return {
      ...serviceFailure(error, fallback),
      ...context,
      stage,
      usage,
    };
  } finally {
    pendingRecords.delete(key);
  }
}

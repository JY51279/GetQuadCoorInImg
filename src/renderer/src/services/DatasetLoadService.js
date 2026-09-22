import { prepareJsonProcess } from '../utils/DatasetPreparation.js';
import { DATASET_FILE_STATUS, createDatasetTarget } from '../../../shared/DatasetFileResponse.js';
import { USER_MESSAGES, toUserErrorMessage } from '../../../shared/UserMessages.js';
import { normalizeJsonSaveResult } from '../../../shared/JsonSaveResult.js';
import { isFilePath, isRecord, normalizeServiceErrorKind, SERVICE_ERROR_KIND } from '../../../shared/ServiceResult.js';

export const DATASET_LOAD_STATUS = Object.freeze({
  READY: 'ready',
  CANCELED: 'canceled',
  FAILED: 'failed',
  STALE: 'stale',
});

export function normalizeDatasetTarget(target) {
  const normalizedTarget = createDatasetTarget(target?.path, target?.fileName);
  return normalizedTarget ? { ...normalizedTarget, path: normalizedTarget.path.replace(/[\\/]/g, '/') } : null;
}

function failed(target, error = '') {
  return { status: DATASET_LOAD_STATUS.FAILED, target, error };
}

export async function prepareDatasetLoad(
  response,
  { confirmLossyRepair = () => false, resolveImagePaths, saveJsonFile, isCurrent = () => true } = {},
) {
  const target = normalizeDatasetTarget(response?.target);
  if (response?.status === DATASET_FILE_STATUS.CANCELED) {
    return { status: DATASET_LOAD_STATUS.CANCELED, target, error: response?.error || '' };
  }
  if (response?.status !== DATASET_FILE_STATUS.READY) {
    return {
      ...failed(target, toUserErrorMessage(response?.error, USER_MESSAGES.JSON_READ_FAILED)),
      ...(response?.errorKind ? { errorKind: normalizeServiceErrorKind(response.errorKind) } : {}),
    };
  }
  if (target === null || typeof response?.jsonInfo?.str !== 'string') {
    return failed(target, 'JSON 文件响应无效。');
  }

  try {
    const jsonData = { str: response.jsonInfo.str, ...target };
    let preparedJson = prepareJsonProcess(jsonData);
    if (!preparedJson.success) return failed(target, `加载 JSON 失败：${preparedJson.error}`);

    if (preparedJson.requiresLossyRepair) {
      const confirmed = confirmLossyRepair(
        `${preparedJson.lossyRepairSummary}\n\n这些修改会丢弃部分原始数据，是否继续？` +
          '继续后会创建临时备份，备份保留 7 天并自动删除。',
      );
      if (!confirmed) {
        return {
          status: DATASET_LOAD_STATUS.CANCELED,
          target,
          error: '已取消加载，原始数据未执行任何有损修复。',
        };
      }

      preparedJson = prepareJsonProcess(jsonData, { allowLossyRepairs: true });
      if (!preparedJson.success) return failed(target, `修复 JSON 失败：${preparedJson.error}`);
    }

    const resolvedPathResult = await resolveImagePaths({
      jsonFilePath: preparedJson.path,
      imagePaths: preparedJson.imagePaths,
    });
    if (!isCurrent()) return { status: DATASET_LOAD_STATUS.STALE, target };
    if (!isRecord(resolvedPathResult) || typeof resolvedPathResult.success !== 'boolean') {
      return { ...failed(target, '图片路径解析响应格式无效。'), errorKind: SERVICE_ERROR_KIND.INVALID_RESPONSE };
    }
    if (!resolvedPathResult.success) {
      return {
        ...failed(target, toUserErrorMessage(resolvedPathResult.error, USER_MESSAGES.IMAGE_PATH_RESOLUTION_FAILED)),
        errorKind: normalizeServiceErrorKind(resolvedPathResult.errorKind),
      };
    }
    if (
      !Array.isArray(resolvedPathResult.imagePaths) ||
      resolvedPathResult.imagePaths.length !== preparedJson.imagePaths.length ||
      !resolvedPathResult.imagePaths.every(isFilePath)
    ) {
      return {
        ...failed(target, '图片路径解析响应与图集图片项不匹配。'),
        errorKind: SERVICE_ERROR_KIND.INVALID_RESPONSE,
      };
    }
    preparedJson.imagePaths = resolvedPathResult.imagePaths.map(imagePath => imagePath.replace(/[\\/]/g, '/'));

    let backupPath = '';
    if (preparedJson.changed) {
      const saved = normalizeJsonSaveResult(
        await saveJsonFile(preparedJson.fileInfo, {
          backupOriginal: preparedJson.lossyRepairsApplied,
        }),
      );
      if (!isCurrent()) return { status: DATASET_LOAD_STATUS.STALE, target };
      if (!saved.success)
        return { ...failed(target, saved.error), errorKind: saved.errorKind, backupPath: saved.backupPath };
      backupPath = saved.backupPath;
    }

    return { status: DATASET_LOAD_STATUS.READY, target, preparedJson, jsonData, backupPath };
  } catch (error) {
    console.error('Failed to prepare dataset:', error);
    return failed(target, toUserErrorMessage(error, '处理 JSON 文件失败。'));
  }
}

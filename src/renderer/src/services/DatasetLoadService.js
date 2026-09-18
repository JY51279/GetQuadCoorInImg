import { prepareJsonProcess } from '../state/DatasetState.js';
import { DATASET_FILE_STATUS, createDatasetTarget } from '../../../shared/DatasetFileResponse.js';
import { USER_MESSAGES, toUserErrorMessage } from '../../../shared/UserMessages.js';

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
    return failed(target, toUserErrorMessage(response?.error, USER_MESSAGES.JSON_READ_FAILED));
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
    if (!resolvedPathResult.success) {
      return failed(target, toUserErrorMessage(resolvedPathResult.error, USER_MESSAGES.IMAGE_PATH_RESOLUTION_FAILED));
    }
    preparedJson.imagePaths = resolvedPathResult.imagePaths.map(imagePath => imagePath.replace(/[\\/]/g, '/'));

    if (preparedJson.changed) {
      const saved = await saveJsonFile(preparedJson.fileInfo, {
        backupOriginal: preparedJson.lossyRepairsApplied,
      });
      if (!saved) return failed(target, '保存规范化后的 JSON 文件失败。');
      if (!isCurrent()) return { status: DATASET_LOAD_STATUS.STALE, target };
    }

    return { status: DATASET_LOAD_STATUS.READY, target, preparedJson, jsonData };
  } catch (error) {
    return failed(target, toUserErrorMessage(error, '处理 JSON 文件失败。'));
  }
}

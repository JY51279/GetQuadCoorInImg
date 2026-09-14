import { prepareJsonProcess } from '../state/DatasetState.js';
import { USER_MESSAGES, toUserErrorMessage } from '../../../shared/UserMessages.js';

export const DATASET_LOAD_STATUS = Object.freeze({
  READY: 'ready',
  CANCELED: 'canceled',
  FAILED: 'failed',
  STALE: 'stale',
});

function failed(error = '') {
  return { status: DATASET_LOAD_STATUS.FAILED, error };
}

export async function prepareDatasetLoad(
  response,
  { confirmLossyRepair = () => false, resolveImagePaths, saveJsonFile, isCurrent = () => true } = {},
) {
  if (response?.canceled) return { status: DATASET_LOAD_STATUS.CANCELED, error: '' };
  if (!response?.success) {
    return failed(toUserErrorMessage(response?.error, USER_MESSAGES.JSON_READ_FAILED));
  }

  try {
    const jsonData = { ...response.jsonInfo, path: response.jsonInfo.path.replace(/[\\/]/g, '/') };
    let preparedJson = prepareJsonProcess(jsonData);
    if (!preparedJson.success) return failed(`加载 JSON 失败：${preparedJson.error}`);

    if (preparedJson.requiresLossyRepair) {
      const confirmed = confirmLossyRepair(
        `${preparedJson.lossyRepairSummary}\n\n这些修改会丢弃部分原始数据，是否继续？` +
          '继续后会创建临时备份，备份保留 7 天并自动删除。',
      );
      if (!confirmed) {
        return {
          status: DATASET_LOAD_STATUS.CANCELED,
          error: '已取消加载，原始数据未执行任何有损修复。',
        };
      }

      preparedJson = prepareJsonProcess(jsonData, { allowLossyRepairs: true });
      if (!preparedJson.success) return failed(`修复 JSON 失败：${preparedJson.error}`);
    }

    const resolvedPathResult = await resolveImagePaths({
      jsonFilePath: preparedJson.path,
      imagePaths: preparedJson.imagePaths,
    });
    if (!isCurrent()) return { status: DATASET_LOAD_STATUS.STALE };
    if (!resolvedPathResult.success) {
      return failed(toUserErrorMessage(resolvedPathResult.error, USER_MESSAGES.IMAGE_PATH_RESOLUTION_FAILED));
    }
    preparedJson.imagePaths = resolvedPathResult.imagePaths.map(imagePath => imagePath.replace(/[\\/]/g, '/'));

    if (preparedJson.changed) {
      const saved = await saveJsonFile(preparedJson.fileInfo, {
        backupOriginal: preparedJson.lossyRepairsApplied,
      });
      if (!saved) return failed('保存规范化后的 JSON 文件失败。');
      if (!isCurrent()) return { status: DATASET_LOAD_STATUS.STALE };
    }

    return { status: DATASET_LOAD_STATUS.READY, preparedJson, jsonData };
  } catch (error) {
    return failed(toUserErrorMessage(error, '处理 JSON 文件失败。'));
  }
}

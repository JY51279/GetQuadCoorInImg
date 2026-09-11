import { prepareJsonProcess } from '../state/DatasetState.js';

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
    return failed(`Failed to read JSON file: ${response?.error || 'Unknown JSON loading error.'}`);
  }

  try {
    const jsonData = { ...response.jsonInfo, path: response.jsonInfo.path.replace(/[\\/]/g, '/') };
    let preparedJson = prepareJsonProcess(jsonData);
    if (!preparedJson.success) return failed(`Failed to load JSON: ${preparedJson.error}`);

    if (preparedJson.requiresLossyRepair) {
      const confirmed = confirmLossyRepair(
        `${preparedJson.lossyRepairSummary}\n\nThese changes can discard original data. Continue? ` +
          'A temporary backup will be retained for 7 days and then deleted automatically.',
      );
      if (!confirmed) {
        return {
          status: DATASET_LOAD_STATUS.CANCELED,
          error: 'Dataset loading was canceled before any lossy repair was applied.',
        };
      }

      preparedJson = prepareJsonProcess(jsonData, { allowLossyRepairs: true });
      if (!preparedJson.success) return failed(`Failed to repair JSON: ${preparedJson.error}`);
    }

    const resolvedPathResult = await resolveImagePaths({
      jsonFilePath: preparedJson.path,
      imagePaths: preparedJson.imagePaths,
    });
    if (!isCurrent()) return { status: DATASET_LOAD_STATUS.STALE };
    if (!resolvedPathResult.success) {
      return failed(`Failed to resolve JSON image paths: ${resolvedPathResult.error}`);
    }
    preparedJson.imagePaths = resolvedPathResult.imagePaths.map(imagePath => imagePath.replace(/[\\/]/g, '/'));

    if (preparedJson.changed) {
      const saved = await saveJsonFile(preparedJson.fileInfo, {
        backupOriginal: preparedJson.lossyRepairsApplied,
      });
      if (!saved) return failed();
      if (!isCurrent()) return { status: DATASET_LOAD_STATUS.STALE };
    }

    return { status: DATASET_LOAD_STATUS.READY, preparedJson, jsonData };
  } catch (error) {
    return failed(`Failed to process JSON file: ${error.message}`);
  }
}

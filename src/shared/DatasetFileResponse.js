export const DATASET_FILE_STATUS = Object.freeze({
  READY: 'ready',
  FAILED: 'failed',
  CANCELED: 'canceled',
});

export function createDatasetTarget(filePath, fileName = '') {
  if (typeof filePath !== 'string' || filePath.length === 0) return null;
  const fallbackFileName = filePath.split(/[\\/]/).at(-1) || '';
  return {
    path: filePath,
    fileName: typeof fileName === 'string' && fileName.length > 0 ? fileName : fallbackFileName,
  };
}

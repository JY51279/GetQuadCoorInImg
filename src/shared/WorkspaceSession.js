export const WORKSPACE_SESSION_SCHEMA_VERSION = 1;

function normalizeRequiredPath(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value : '';
}

export function createWorkspaceSession(datasetPath, { imagePath = '', imageIndex = null } = {}) {
  const normalizedDatasetPath = normalizeRequiredPath(datasetPath);
  if (!normalizedDatasetPath) return null;

  const normalizedImagePath = normalizeRequiredPath(imagePath);
  const normalizedImageIndex =
    normalizedImagePath && Number.isSafeInteger(imageIndex) && imageIndex >= 0 ? imageIndex : null;

  return {
    schemaVersion: WORKSPACE_SESSION_SCHEMA_VERSION,
    datasetPath: normalizedDatasetPath,
    imagePath: normalizedImagePath,
    imageIndex: normalizedImageIndex,
  };
}

export function normalizeWorkspaceSession(value) {
  if (!value || value.schemaVersion !== WORKSPACE_SESSION_SCHEMA_VERSION) return null;
  return createWorkspaceSession(value.datasetPath, {
    imagePath: value.imagePath,
    imageIndex: value.imageIndex,
  });
}

// Request/response channel names are shared by registration and renderer callers.
export const IPC_CHANNELS = Object.freeze({
  OPEN_IMAGE: 'open-image-file-dialog',
  PREPARE_IMAGE: 'prepare-image',
  PREPARE_ANNOTATION_IMAGES: 'prepare-annotation-images',
  OPEN_DATASET: 'open-json-file-dialog',
  ADJACENT_DATASET: 'open-adjacent-json-file',
  READ_DATASET: 'read-json-file',
  RESOLVE_IMAGE_PATHS: 'resolve-json-image-paths',
  SAVE_JSON: 'save-json-file',
  GET_WORKSPACE: 'get-workspace-session',
  RECORD_DATASET: 'record-workspace-dataset',
  RECORD_IMAGE: 'record-workspace-image',
  NORMALIZE_ANNOTATION: 'normalize-annotation',
  NORMALIZE_VISUAL_ANNOTATION: 'normalize-visual-annotation',
  LOAD_ANNOTATIONS: 'load-annotations',
  GENERATE_AND_SAVE_ANNOTATION: 'generate-and-save-annotation',
  ANNOTATION_PROGRESS: 'annotation-progress',
});

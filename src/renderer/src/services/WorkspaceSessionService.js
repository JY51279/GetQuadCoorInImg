import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';
import { createWorkspaceSession, normalizeWorkspaceSession } from '../../../shared/WorkspaceSession.js';
import {
  isFilePath,
  isRecord,
  normalizeServiceErrorKind,
  serviceFailure,
  SERVICE_ERROR_KIND,
} from '../../../shared/ServiceResult.js';

function failed(error, errorKind = SERVICE_ERROR_KIND.OPERATION) {
  return { ...serviceFailure(error, '工作区记录操作失败。', errorKind), session: null };
}

function responseFailure(response, fallback) {
  if (!isRecord(response) || typeof response.success !== 'boolean') {
    console.error('Invalid workspace response:', response);
    return failed('工作区记录响应格式无效。', SERVICE_ERROR_KIND.INVALID_RESPONSE);
  }
  const errorKind = normalizeServiceErrorKind(response.errorKind);
  return response.success ? null : { ...serviceFailure(response.error, fallback, errorKind), session: null };
}

function readSession(value) {
  if (
    !isRecord(value) ||
    !isFilePath(value.datasetPath) ||
    (value.imagePath !== undefined && value.imagePath !== '' && !isFilePath(value.imagePath)) ||
    (value.imageIndex != null && (!Number.isSafeInteger(value.imageIndex) || value.imageIndex < 0))
  )
    return null;
  return normalizeWorkspaceSession(value);
}

/** Checkpoints are best-effort. A successful stale response did not apply a write. */
export function createWorkspaceSessionService({ invoke } = {}) {
  function normalizeRecordResponse(response, fallbackError) {
    const failure = responseFailure(response, fallbackError);
    if (failure) return failure;
    if (
      typeof response.changed !== 'boolean' ||
      typeof response.stale !== 'boolean' ||
      (response.changed && response.stale)
    ) {
      return failed('工作区记录响应格式无效。', SERVICE_ERROR_KIND.INVALID_RESPONSE);
    }
    const session = response.session === null ? null : readSession(response.session);
    if (response.session !== null && !session)
      return failed('工作区记录响应格式无效。', SERVICE_ERROR_KIND.INVALID_RESPONSE);
    return { success: true, changed: response.changed, stale: response.stale, session, error: '' };
  }

  async function get() {
    try {
      const response = await invoke(IPC_CHANNELS.GET_WORKSPACE);
      const failure = responseFailure(response, '读取上次工作区记录失败。');
      if (failure) return failure;
      if (response.session === null) return { success: true, session: null, error: '' };
      const session = readSession(response.session);
      return session
        ? { success: true, session, error: '' }
        : failed('上次工作区记录格式无效，已忽略。', SERVICE_ERROR_KIND.INVALID_RESPONSE);
    } catch (error) {
      console.error('Workspace session IPC failed:', error);
      return failed('读取上次工作区记录失败。', SERVICE_ERROR_KIND.TRANSPORT);
    }
  }

  async function recordDatasetTarget(datasetPath) {
    const session = isFilePath(datasetPath) ? createWorkspaceSession(datasetPath) : null;
    if (!session) return failed('工作区记录缺少有效的图集路径。', SERVICE_ERROR_KIND.INVALID_REQUEST);
    try {
      const response = await invoke(IPC_CHANNELS.RECORD_DATASET, { datasetPath: session.datasetPath });
      return normalizeRecordResponse(response, '保存工作区图集记录失败。');
    } catch (error) {
      console.error('Workspace dataset IPC failed:', error);
      return failed('保存工作区图集记录失败。', SERVICE_ERROR_KIND.TRANSPORT);
    }
  }

  async function recordImage(request = {}) {
    const session =
      isRecord(request) && isFilePath(request.datasetPath) && isFilePath(request.imagePath)
        ? createWorkspaceSession(request.datasetPath, request)
        : null;
    if (!session?.imagePath || session.imageIndex === null)
      return failed('工作区图片记录无效。', SERVICE_ERROR_KIND.INVALID_REQUEST);
    try {
      const response = await invoke(IPC_CHANNELS.RECORD_IMAGE, {
        datasetPath: session.datasetPath,
        imagePath: session.imagePath,
        imageIndex: session.imageIndex,
      });
      return normalizeRecordResponse(response, '保存工作区图片记录失败。');
    } catch (error) {
      console.error('Workspace image IPC failed:', error);
      return failed('保存工作区图片记录失败。', SERVICE_ERROR_KIND.TRANSPORT);
    }
  }

  return { get, recordDatasetTarget, recordImage };
}

// Checkpoint writes are best-effort: diagnose failures, never reject an unobserved background promise.
export async function observeWorkspaceRecord(recordOperation) {
  try {
    const result = await recordOperation;
    if (result?.success !== true) console.error('Failed to record workspace checkpoint:', result);
  } catch (error) {
    console.error('Workspace checkpoint unexpectedly rejected:', error);
  }
}

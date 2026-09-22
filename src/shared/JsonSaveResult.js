import { USER_MESSAGES } from './UserMessages.js';
import {
  isFilePath,
  isRecord,
  normalizeServiceErrorKind,
  serviceFailure,
  SERVICE_ERROR_KIND,
} from './ServiceResult.js';

export function isJsonSaveRequest(value) {
  return (
    isRecord(value) &&
    isFilePath(value.path) &&
    typeof value.str === 'string' &&
    (value.backupOriginal === undefined || typeof value.backupOriginal === 'boolean')
  );
}

/** @returns {{success: boolean, backupPath: string, error: string, errorKind: string}} */
export function normalizeJsonSaveResult(response) {
  if (
    !isRecord(response) ||
    typeof response.success !== 'boolean' ||
    (response.backupPath !== undefined && typeof response.backupPath !== 'string')
  ) {
    return { ...serviceFailure(null, 'JSON 保存响应格式无效。', SERVICE_ERROR_KIND.INVALID_RESPONSE), backupPath: '' };
  }
  if (!response.success) {
    const kind = normalizeServiceErrorKind(response.errorKind);
    return {
      ...serviceFailure(response.error, USER_MESSAGES.JSON_SAVE_FAILED, kind),
      backupPath: response.backupPath || '',
    };
  }
  return { success: true, backupPath: response.backupPath || '', error: '', errorKind: '' };
}

export function getBackupMessage(backupPath) {
  return `已创建临时 JSON 备份，将在 7 天后自动删除：${backupPath}`;
}

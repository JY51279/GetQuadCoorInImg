import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';
import { USER_MESSAGES } from '../../../shared/UserMessages.js';
import { isJsonSaveRequest, normalizeJsonSaveResult } from '../../../shared/JsonSaveResult.js';
import { serviceFailure, SERVICE_ERROR_KIND } from '../../../shared/ServiceResult.js';

export function createJsonFileService({ invoke } = {}) {
  /** Returns a normalized save result; user notifications belong to workspace orchestration. */
  async function save(jsonFileInfo, { backupOriginal = false } = {}) {
    const request = { ...jsonFileInfo, backupOriginal };
    if (!isJsonSaveRequest(request)) {
      return normalizeJsonSaveResult(serviceFailure(null, 'JSON 保存请求无效。', SERVICE_ERROR_KIND.INVALID_REQUEST));
    }
    try {
      const response = await invoke(IPC_CHANNELS.SAVE_JSON, request);
      const result = normalizeJsonSaveResult(response);
      if (!result.success) console.error('Failed to save JSON file:', response);
      return result;
    } catch (error) {
      console.error('An error occurred while saving JSON file:', error);
      return normalizeJsonSaveResult(
        serviceFailure(error, USER_MESSAGES.JSON_SAVE_FAILED, SERVICE_ERROR_KIND.TRANSPORT),
      );
    }
  }

  return { save };
}

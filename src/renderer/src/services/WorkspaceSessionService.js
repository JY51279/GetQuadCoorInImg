import { createWorkspaceSession, normalizeWorkspaceSession } from '../../../shared/WorkspaceSession.js';

function failed(error) {
  return { success: false, session: null, error };
}

export function createWorkspaceSessionService({ invoke } = {}) {
  function normalizeRecordResponse(response, fallbackError) {
    if (!response?.success) return failed(response?.error || fallbackError);
    const session = response.session === null ? null : normalizeWorkspaceSession(response.session);
    if (response.session !== null && !session) return failed('工作区记录响应格式无效。');
    return {
      success: true,
      changed: response.changed === true,
      stale: response.stale === true,
      session,
      error: '',
    };
  }

  async function get() {
    try {
      const response = await invoke('get-workspace-session');
      if (!response?.success) return failed(response?.error || '读取上次工作区记录失败。');
      if (response.session === null) return { success: true, session: null, error: '' };

      const session = normalizeWorkspaceSession(response.session);
      return session ? { success: true, session, error: '' } : failed('上次工作区记录格式无效，已忽略。');
    } catch {
      return failed('读取上次工作区记录失败。');
    }
  }

  async function recordDatasetTarget(datasetPath) {
    const session = createWorkspaceSession(datasetPath);
    if (!session) return failed('工作区记录缺少有效的图集路径。');

    try {
      const response = await invoke('record-workspace-dataset', { datasetPath: session.datasetPath });
      return normalizeRecordResponse(response, '保存工作区图集记录失败。');
    } catch {
      return failed('保存工作区图集记录失败。');
    }
  }

  async function recordImage({ datasetPath, imagePath, imageIndex } = {}) {
    const session = createWorkspaceSession(datasetPath, { imagePath, imageIndex });
    if (!session?.imagePath || session.imageIndex === null) return failed('工作区图片记录无效。');

    try {
      const response = await invoke('record-workspace-image', {
        datasetPath: session.datasetPath,
        imagePath: session.imagePath,
        imageIndex: session.imageIndex,
      });
      return normalizeRecordResponse(response, '保存工作区图片记录失败。');
    } catch {
      return failed('保存工作区图片记录失败。');
    }
  }

  return { get, recordDatasetTarget, recordImage };
}

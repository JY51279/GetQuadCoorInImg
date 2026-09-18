import { createWorkspaceSession, normalizeWorkspaceSession } from '../../../shared/WorkspaceSession.js';

function failed(error) {
  return { success: false, session: null, error };
}

export function createWorkspaceSessionService({ invoke } = {}) {
  async function load() {
    try {
      const response = await invoke('load-workspace-session');
      if (!response?.success) return failed(response?.error || '读取上次工作区记录失败。');
      if (response.session === null) return { success: true, session: null, error: '' };

      const session = normalizeWorkspaceSession(response.session);
      return session ? { success: true, session, error: '' } : failed('上次工作区记录格式无效，已忽略。');
    } catch {
      return failed('读取上次工作区记录失败。');
    }
  }

  async function save(datasetPath, image = null) {
    const session = createWorkspaceSession(datasetPath, {
      imagePath: image?.path,
      imageIndex: image?.index,
    });
    if (!session) return failed('工作区记录缺少有效的图集路径。');

    try {
      const response = await invoke('save-workspace-session', session);
      return response?.success
        ? { success: true, session, error: '' }
        : failed(response?.error || '保存工作区记录失败。');
    } catch {
      return failed('保存工作区记录失败。');
    }
  }

  return { load, save };
}

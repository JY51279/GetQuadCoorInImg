import fs from 'fs';
import path from 'path';
import { saveJsonFileAtomically } from './FileOperations.js';
import { normalizeWorkspaceSession } from '../shared/WorkspaceSession.js';

let workspaceSessionFile = '';
let saveQueue = Promise.resolve();

export function initializeWorkspaceSessionStore(electronApp) {
  workspaceSessionFile = path.join(electronApp.getPath('userData'), 'workspace-session.json');
  saveQueue = Promise.resolve();
}

export async function loadWorkspaceSession() {
  if (!workspaceSessionFile) return null;
  await saveQueue.catch(() => {});

  try {
    const sessionText = await fs.promises.readFile(workspaceSessionFile, 'utf-8');
    return normalizeWorkspaceSession(JSON.parse(sessionText));
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Failed to load workspace session:', error.message);
    return null;
  }
}

export function saveWorkspaceSession(session) {
  const normalizedSession = normalizeWorkspaceSession(session);
  if (!workspaceSessionFile) return Promise.reject(new Error('工作区恢复存储尚未初始化。'));
  if (!normalizedSession) return Promise.reject(new Error('工作区恢复信息无效。'));

  const save = () =>
    saveJsonFileAtomically({
      path: workspaceSessionFile,
      str: JSON.stringify(normalizedSession, null, 2),
    });
  saveQueue = saveQueue.catch(() => {}).then(save);
  return saveQueue.then(() => normalizedSession);
}

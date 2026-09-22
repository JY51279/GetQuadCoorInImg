import fs from 'fs';
import path from 'path';
import { areFilePathsEqual, saveJsonFileAtomically } from './FileOperations.js';
import { createWorkspaceSession, normalizeWorkspaceSession } from '../shared/WorkspaceSession.js';

let workspaceSessionFile = '';
let currentSession = null;
let sessionReadFailure = null;
let operationQueue = Promise.resolve();

function cloneSession(session) {
  return session ? { ...session } : null;
}

async function readWorkspaceSession() {
  let sessionText;
  try {
    sessionText = await fs.promises.readFile(workspaceSessionFile, 'utf-8');
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
  try {
    return normalizeWorkspaceSession(JSON.parse(sessionText));
  } catch (error) {
    // Keep the existing compatibility policy for corrupt or unsupported records.
    console.error('Ignoring invalid workspace session:', error);
    return null;
  }
}

function enqueueOperation(operation) {
  const queuedOperation = operationQueue.catch(() => {}).then(operation);
  operationQueue = queuedOperation;
  return queuedOperation;
}

async function writeWorkspaceSession(session) {
  await saveJsonFileAtomically({
    path: workspaceSessionFile,
    str: JSON.stringify(session, null, 2),
  });
  currentSession = session;
  sessionReadFailure = null;
}

function requireInitializedStore() {
  if (!workspaceSessionFile) throw new Error('工作区恢复存储尚未初始化。');
}

export function initializeWorkspaceSessionStore(electronApp) {
  workspaceSessionFile = path.join(electronApp.getPath('userData'), 'workspace-session.json');
  currentSession = null;
  sessionReadFailure = null;
  // A checkpoint read failure must not abort application startup. Preserve it for
  // the restore request instead of disguising it as a missing checkpoint.
  operationQueue = readWorkspaceSession().then(
    session => {
      currentSession = session;
    },
    error => {
      sessionReadFailure = { error };
      console.error('Failed to load workspace session:', error);
    },
  );
  return operationQueue;
}

export function getWorkspaceSession() {
  requireInitializedStore();
  return enqueueOperation(() => {
    if (sessionReadFailure) throw sessionReadFailure.error;
    return cloneSession(currentSession);
  });
}

export function recordWorkspaceDatasetTarget(datasetPath) {
  requireInitializedStore();
  const datasetSession = createWorkspaceSession(datasetPath);
  if (!datasetSession) return Promise.reject(new Error('工作区记录缺少有效的图集路径。'));

  return enqueueOperation(async () => {
    if (areFilePathsEqual(currentSession?.datasetPath, datasetSession.datasetPath)) {
      return { changed: false, stale: false, session: cloneSession(currentSession) };
    }

    await writeWorkspaceSession(datasetSession);
    return { changed: true, stale: false, session: cloneSession(currentSession) };
  });
}

export function recordWorkspaceDatasetImage({ datasetPath, imagePath, imageIndex } = {}) {
  requireInitializedStore();
  const imageSession = createWorkspaceSession(datasetPath, { imagePath, imageIndex });
  if (!imageSession?.imagePath || imageSession.imageIndex === null) {
    return Promise.reject(new Error('工作区图片记录无效。'));
  }

  return enqueueOperation(async () => {
    if (!areFilePathsEqual(currentSession?.datasetPath, imageSession.datasetPath)) {
      return { changed: false, stale: true, session: cloneSession(currentSession) };
    }
    const unchanged =
      areFilePathsEqual(currentSession.imagePath, imageSession.imagePath) &&
      currentSession.imageIndex === imageSession.imageIndex;
    if (unchanged) {
      return { changed: false, stale: false, session: cloneSession(currentSession) };
    }

    await writeWorkspaceSession(imageSession);
    return { changed: true, stale: false, session: cloneSession(currentSession) };
  });
}

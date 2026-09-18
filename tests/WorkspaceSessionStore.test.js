import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  initializeWorkspaceSessionStore,
  loadWorkspaceSession,
  saveWorkspaceSession,
} from '../src/main/WorkspaceSessionStore.js';
import { createWorkspaceSession } from '../src/shared/WorkspaceSession.js';

const temporaryDirectories = [];

async function initializeStore() {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'quadtool-session-test-'));
  temporaryDirectories.push(userData);
  initializeWorkspaceSessionStore({
    getPath(name) {
      if (name !== 'userData') throw new Error(`Unexpected path: ${name}`);
      return userData;
    },
  });
  return userData;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(
    temporaryDirectories.splice(0).map(directory => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('Workspace session store', () => {
  it('returns no session when the settings file does not exist', async () => {
    await initializeStore();

    await expect(loadWorkspaceSession()).resolves.toBeNull();
  });

  it('persists and reloads a versioned workspace session', async () => {
    const userData = await initializeStore();
    const session = createWorkspaceSession('C:/datasets/A.json', {
      imagePath: 'C:/datasets/images/12.png',
      imageIndex: 11,
    });

    await expect(saveWorkspaceSession(session)).resolves.toEqual(session);
    await expect(loadWorkspaceSession()).resolves.toEqual(session);
    expect(JSON.parse(await fs.readFile(path.join(userData, 'workspace-session.json'), 'utf-8'))).toEqual(session);
  });

  it('serializes writes so the last requested session remains on disk', async () => {
    await initializeStore();
    const first = createWorkspaceSession('C:/datasets/A.json');
    const second = createWorkspaceSession('C:/datasets/B.json', {
      imagePath: 'C:/datasets/b.png',
      imageIndex: 2,
    });

    await Promise.all([saveWorkspaceSession(first), saveWorkspaceSession(second)]);

    await expect(loadWorkspaceSession()).resolves.toEqual(second);
  });

  it('ignores malformed, corrupt, and unsupported session files', async () => {
    const userData = await initializeStore();
    const sessionPath = path.join(userData, 'workspace-session.json');
    vi.spyOn(console, 'error').mockImplementation(() => {});

    await fs.writeFile(sessionPath, '{invalid', 'utf-8');
    await expect(loadWorkspaceSession()).resolves.toBeNull();

    await fs.writeFile(sessionPath, JSON.stringify({ schemaVersion: 99, datasetPath: 'C:/A.json' }), 'utf-8');
    await expect(loadWorkspaceSession()).resolves.toBeNull();
  });

  it('rejects invalid sessions before writing', async () => {
    const userData = await initializeStore();

    await expect(saveWorkspaceSession({ schemaVersion: 1, datasetPath: '' })).rejects.toThrow('工作区恢复信息无效。');
    await expect(fs.readdir(userData)).resolves.toEqual([]);
  });
});

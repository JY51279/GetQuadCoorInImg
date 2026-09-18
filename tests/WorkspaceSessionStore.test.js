import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getWorkspaceSession,
  initializeWorkspaceSessionStore,
  recordWorkspaceDatasetImage,
  recordWorkspaceDatasetTarget,
} from '../src/main/WorkspaceSessionStore.js';
import { createWorkspaceSession } from '../src/shared/WorkspaceSession.js';

const temporaryDirectories = [];

async function initializeStore(initialSessionText = null) {
  const userData = await fs.mkdtemp(path.join(os.tmpdir(), 'quadtool-session-test-'));
  temporaryDirectories.push(userData);
  if (initialSessionText !== null) {
    await fs.writeFile(path.join(userData, 'workspace-session.json'), initialSessionText, 'utf-8');
  }
  await initializeWorkspaceSessionStore({
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

    await expect(getWorkspaceSession()).resolves.toBeNull();
  });

  it('loads an existing versioned workspace session during initialization', async () => {
    const session = createWorkspaceSession('C:/datasets/A.json', {
      imagePath: 'C:/datasets/images/12.png',
      imageIndex: 11,
    });
    await initializeStore(JSON.stringify(session));

    await expect(getWorkspaceSession()).resolves.toEqual(session);
  });

  it('records a dataset target and clears image state when the dataset changes', async () => {
    const userData = await initializeStore();

    await expect(recordWorkspaceDatasetTarget('C:/datasets/A.json')).resolves.toMatchObject({
      changed: true,
      stale: false,
      session: { datasetPath: 'C:/datasets/A.json', imagePath: '', imageIndex: null },
    });
    await recordWorkspaceDatasetImage({
      datasetPath: 'C:/datasets/A.json',
      imagePath: 'C:/datasets/a.png',
      imageIndex: 2,
    });
    await expect(recordWorkspaceDatasetTarget('C:/datasets/B.json')).resolves.toMatchObject({
      changed: true,
      stale: false,
      session: { datasetPath: 'C:/datasets/B.json', imagePath: '', imageIndex: null },
    });

    const saved = JSON.parse(await fs.readFile(path.join(userData, 'workspace-session.json'), 'utf-8'));
    expect(saved).toMatchObject({ datasetPath: 'C:/datasets/B.json', imagePath: '', imageIndex: null });
  });

  it('preserves the image checkpoint when the same dataset target is selected again', async () => {
    const session = createWorkspaceSession('C:/datasets/A.json', {
      imagePath: 'C:/datasets/a.png',
      imageIndex: 2,
    });
    await initializeStore(JSON.stringify(session));

    await expect(recordWorkspaceDatasetTarget('C:/datasets/A.json')).resolves.toEqual({
      changed: false,
      stale: false,
      session,
    });
    await expect(getWorkspaceSession()).resolves.toEqual(session);
  });

  it('rejects an image result belonging to a stale dataset target', async () => {
    await initializeStore();
    await recordWorkspaceDatasetTarget('C:/datasets/A.json');
    await recordWorkspaceDatasetTarget('C:/datasets/B.json');

    await expect(
      recordWorkspaceDatasetImage({
        datasetPath: 'C:/datasets/A.json',
        imagePath: 'C:/datasets/a.png',
        imageIndex: 0,
      }),
    ).resolves.toMatchObject({
      changed: false,
      stale: true,
      session: { datasetPath: 'C:/datasets/B.json', imagePath: '', imageIndex: null },
    });
    await expect(getWorkspaceSession()).resolves.toMatchObject({
      datasetPath: 'C:/datasets/B.json',
      imagePath: '',
      imageIndex: null,
    });
  });

  it('serializes semantic updates in request order', async () => {
    await initializeStore();

    await Promise.all([
      recordWorkspaceDatasetTarget('C:/datasets/A.json'),
      recordWorkspaceDatasetTarget('C:/datasets/B.json'),
      recordWorkspaceDatasetImage({
        datasetPath: 'C:/datasets/B.json',
        imagePath: 'C:/datasets/b.png',
        imageIndex: 3,
      }),
    ]);

    await expect(getWorkspaceSession()).resolves.toMatchObject({
      datasetPath: 'C:/datasets/B.json',
      imagePath: 'C:/datasets/b.png',
      imageIndex: 3,
    });
  });

  it('ignores malformed, corrupt, and unsupported session files', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await initializeStore('{invalid');
    await expect(getWorkspaceSession()).resolves.toBeNull();

    await initializeStore(JSON.stringify({ schemaVersion: 99, datasetPath: 'C:/A.json' }));
    await expect(getWorkspaceSession()).resolves.toBeNull();
  });

  it('rejects invalid semantic records before writing', async () => {
    const userData = await initializeStore();

    await expect(recordWorkspaceDatasetTarget('')).rejects.toThrow('工作区记录缺少有效的图集路径。');
    await expect(
      recordWorkspaceDatasetImage({ datasetPath: 'C:/datasets/A.json', imagePath: '', imageIndex: 0 }),
    ).rejects.toThrow('工作区图片记录无效。');
    await expect(fs.readdir(userData)).resolves.toEqual([]);
  });
});

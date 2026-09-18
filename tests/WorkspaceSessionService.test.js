import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceSessionService } from '../src/renderer/src/services/WorkspaceSessionService.js';

const SESSION = Object.freeze({
  schemaVersion: 1,
  datasetPath: 'C:/datasets/A.json',
  imagePath: 'C:/images/one.png',
  imageIndex: 0,
});

describe('Workspace session service', () => {
  it('gets a normalized session and distinguishes an empty store', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ success: true, session: SESSION })
      .mockResolvedValueOnce({ success: true, session: null });
    const service = createWorkspaceSessionService({ invoke });

    await expect(service.get()).resolves.toEqual({ success: true, session: SESSION, error: '' });
    await expect(service.get()).resolves.toEqual({ success: true, session: null, error: '' });
    expect(invoke).toHaveBeenNthCalledWith(1, 'get-workspace-session');
  });

  it('records a dataset target without constructing an image checkpoint', async () => {
    const datasetSession = { ...SESSION, imagePath: '', imageIndex: null };
    const invoke = vi.fn(async () => ({
      success: true,
      changed: true,
      stale: false,
      session: datasetSession,
    }));
    const service = createWorkspaceSessionService({ invoke });

    await expect(service.recordDatasetTarget('C:/datasets/A.json')).resolves.toEqual({
      success: true,
      changed: true,
      stale: false,
      session: datasetSession,
      error: '',
    });
    expect(invoke).toHaveBeenCalledWith('record-workspace-dataset', {
      datasetPath: 'C:/datasets/A.json',
    });
  });

  it('records a successful image with its owning dataset identity', async () => {
    const invoke = vi.fn(async () => ({ success: true, changed: true, stale: false, session: SESSION }));
    const service = createWorkspaceSessionService({ invoke });

    await expect(
      service.recordImage({
        datasetPath: 'C:/datasets/A.json',
        imagePath: 'C:/images/one.png',
        imageIndex: 0,
      }),
    ).resolves.toMatchObject({ success: true, changed: true, stale: false, session: SESSION });
    expect(invoke).toHaveBeenCalledWith('record-workspace-image', {
      datasetPath: 'C:/datasets/A.json',
      imagePath: 'C:/images/one.png',
      imageIndex: 0,
    });
  });

  it('returns structured failures for invalid data and IPC errors', async () => {
    const invoke = vi.fn(async () => {
      throw new Error('IPC unavailable');
    });
    const service = createWorkspaceSessionService({ invoke });

    await expect(service.recordDatasetTarget('')).resolves.toMatchObject({
      success: false,
      error: '工作区记录缺少有效的图集路径。',
    });
    await expect(
      service.recordImage({ datasetPath: 'C:/A.json', imagePath: '', imageIndex: 0 }),
    ).resolves.toMatchObject({
      success: false,
      error: '工作区图片记录无效。',
    });
    await expect(service.get()).resolves.toMatchObject({
      success: false,
      error: '读取上次工作区记录失败。',
    });
  });

  it('ignores unsupported session schemas returned across IPC', async () => {
    const service = createWorkspaceSessionService({
      invoke: vi.fn(async () => ({
        success: true,
        session: { ...SESSION, schemaVersion: 2 },
      })),
    });

    await expect(service.get()).resolves.toMatchObject({
      success: false,
      session: null,
      error: '上次工作区记录格式无效，已忽略。',
    });
  });
});

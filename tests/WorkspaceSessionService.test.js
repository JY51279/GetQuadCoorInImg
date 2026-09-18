import { describe, expect, it, vi } from 'vitest';
import { createWorkspaceSessionService } from '../src/renderer/src/services/WorkspaceSessionService.js';

const SESSION = Object.freeze({
  schemaVersion: 1,
  datasetPath: 'C:/datasets/A.json',
  imagePath: 'C:/images/one.png',
  imageIndex: 0,
});

describe('Workspace session service', () => {
  it('loads a normalized session and distinguishes an empty store', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce({ success: true, session: SESSION })
      .mockResolvedValueOnce({ success: true, session: null });
    const service = createWorkspaceSessionService({ invoke });

    await expect(service.load()).resolves.toEqual({ success: true, session: SESSION, error: '' });
    await expect(service.load()).resolves.toEqual({ success: true, session: null, error: '' });
  });

  it('saves a normalized dataset and image position', async () => {
    const invoke = vi.fn(async () => ({ success: true }));
    const service = createWorkspaceSessionService({ invoke });

    await expect(service.save('C:/datasets/A.json', { path: 'C:/images/one.png', index: 0 })).resolves.toEqual({
      success: true,
      session: SESSION,
      error: '',
    });
    expect(invoke).toHaveBeenCalledWith('save-workspace-session', SESSION);
  });

  it('returns structured failures for invalid data and IPC errors', async () => {
    const invoke = vi.fn(async () => {
      throw new Error('IPC unavailable');
    });
    const service = createWorkspaceSessionService({ invoke });

    await expect(service.save('')).resolves.toMatchObject({
      success: false,
      error: '工作区记录缺少有效的图集路径。',
    });
    await expect(service.load()).resolves.toMatchObject({
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

    await expect(service.load()).resolves.toMatchObject({
      success: false,
      session: null,
      error: '上次工作区记录格式无效，已忽略。',
    });
  });
});

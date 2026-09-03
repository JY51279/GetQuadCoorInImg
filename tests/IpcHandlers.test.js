import { beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  on: vi.fn(),
  handle: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: { showOpenDialog: electronMocks.showOpenDialog },
  ipcMain: { on: electronMocks.on, handle: electronMocks.handle },
}));

import { handleOpenJsonDialog } from '../src/main/IpcHandlers.js';

describe('Main-process IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the request id when the JSON dialog is canceled', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    const event = { reply: vi.fn() };

    await handleOpenJsonDialog(event, { requestId: 41 });

    expect(event.reply).toHaveBeenCalledWith('choose-json-file-response', {
      success: false,
      canceled: true,
      requestId: 41,
    });
  });

  it('returns the request id when opening the JSON dialog fails', async () => {
    electronMocks.showOpenDialog.mockRejectedValue(new Error('dialog failed'));
    const event = { reply: vi.fn() };

    await handleOpenJsonDialog(event, { requestId: 42 });

    expect(event.reply).toHaveBeenCalledWith('choose-json-file-response', {
      success: false,
      requestId: 42,
      error: 'dialog failed',
    });
  });
});

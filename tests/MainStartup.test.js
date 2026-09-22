import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  whenReady: vi.fn(),
  on: vi.fn(),
  exit: vi.fn(),
  quit: vi.fn(),
  showErrorBox: vi.fn(),
  BrowserWindow: vi.fn(),
  getAllWindows: vi.fn(),
  loadFile: vi.fn(),
  loadURL: vi.fn(),
  setWindowOpenHandler: vi.fn(),
  openExternal: vi.fn(),
  initializeFileOperations: vi.fn(),
  initializeWorkspaceSessionStore: vi.fn(),
  initializeImageFileReader: vi.fn(),
  registerImageProtocol: vi.fn(),
  registerIpcHandlers: vi.fn(),
  is: { dev: false },
}));

vi.mock('electron', () => ({
  app: { whenReady: mocks.whenReady, on: mocks.on, exit: mocks.exit, quit: mocks.quit, isPackaged: true },
  BrowserWindow: mocks.BrowserWindow,
  dialog: { showErrorBox: mocks.showErrorBox },
  shell: { openExternal: mocks.openExternal },
  nativeImage: {},
  net: {},
  protocol: { registerSchemesAsPrivileged: vi.fn() },
}));
vi.mock('@electron-toolkit/utils', () => ({
  is: mocks.is,
  electronApp: { setAppUserModelId: vi.fn() },
  optimizer: { watchWindowShortcuts: vi.fn() },
}));
vi.mock('../resources/icon.png?asset', () => ({ default: 'icon.png' }));
vi.mock('../src/main/FileOperations.js', () => ({ initializeFileOperations: mocks.initializeFileOperations }));
vi.mock('../src/main/WorkspaceSessionStore.js', () => ({
  initializeWorkspaceSessionStore: mocks.initializeWorkspaceSessionStore,
}));
vi.mock('../src/main/ImageFileReader.js', () => ({
  IMAGE_PROTOCOL_SCHEME: 'quadtool-image',
  initializeImageFileReader: mocks.initializeImageFileReader,
  registerImageProtocol: mocks.registerImageProtocol,
}));
vi.mock('../src/main/IpcHandlers.js', () => ({ registerIpcHandlers: mocks.registerIpcHandlers }));

function getActivateHandler() {
  return mocks.on.mock.calls.find(([event]) => event === 'activate')?.[1];
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.is.dev = false;
  mocks.whenReady.mockResolvedValue(undefined);
  mocks.initializeFileOperations.mockResolvedValue(undefined);
  mocks.initializeWorkspaceSessionStore.mockResolvedValue(undefined);
  mocks.initializeImageFileReader.mockResolvedValue(undefined);
  mocks.loadFile.mockResolvedValue(undefined);
  mocks.loadURL.mockResolvedValue(undefined);
  mocks.openExternal.mockResolvedValue(undefined);
  mocks.getAllWindows.mockReturnValue([]);
  mocks.BrowserWindow.getAllWindows = mocks.getAllWindows;
  mocks.BrowserWindow.mockImplementation(function () {
    return {
      on: vi.fn(),
      show: vi.fn(),
      loadFile: mocks.loadFile,
      loadURL: mocks.loadURL,
      webContents: {
        setZoomMode: vi.fn(),
        setZoomFactor: vi.fn(),
        setWindowOpenHandler: mocks.setWindowOpenHandler,
        session: { webRequest: { onHeadersReceived: vi.fn() } },
      },
    };
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Main-process startup failure boundaries (mocked Electron)', () => {
  it('completes initialization and window loading without an error dialog', async () => {
    await import('../src/main/index.js');
    await vi.waitFor(() => expect(getActivateHandler()).toBeTypeOf('function'));
    expect(mocks.registerIpcHandlers).toHaveBeenCalledOnce();
    expect(mocks.loadFile).toHaveBeenCalledOnce();
    expect(mocks.showErrorBox).not.toHaveBeenCalled();
    expect(mocks.exit).not.toHaveBeenCalled();
  });

  it.each(['whenReady', 'initializeFileOperations', 'initializeWorkspaceSessionStore', 'initializeImageFileReader'])(
    'reports and terminates a rejected %s without opening a partial workspace',
    async boundary => {
      const error = Object.assign(new Error('access denied'), { code: 'EACCES' });
      mocks[boundary].mockRejectedValueOnce(error);
      await import('../src/main/index.js');
      await vi.waitFor(() => expect(mocks.exit).toHaveBeenCalledWith(1));
      expect(mocks.BrowserWindow).not.toHaveBeenCalled();
      expect(mocks.showErrorBox).toHaveBeenCalledExactlyOnceWith('QuadTool 启动失败', expect.stringContaining('权限'));
      expect(console.error).toHaveBeenCalledWith('Application startup failed:', error);
    },
  );

  it.each([false, true])('contains window load rejection in development mode %s', async dev => {
    mocks.is.dev = dev;
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173');
    (dev ? mocks.loadURL : mocks.loadFile).mockRejectedValueOnce(null);
    await import('../src/main/index.js');
    await vi.waitFor(() => expect(mocks.exit).toHaveBeenCalledWith(1));
    expect(mocks.showErrorBox).toHaveBeenCalledOnce();
    expect(console.error).toHaveBeenCalledWith('Application startup failed:', null);
    expect(getActivateHandler()).toBeUndefined();
  });

  it('still exits when the native error dialog itself throws', async () => {
    mocks.initializeFileOperations.mockRejectedValueOnce(null);
    mocks.showErrorBox.mockImplementationOnce(() => {
      throw new Error('dialog unavailable');
    });
    await import('../src/main/index.js');
    await vi.waitFor(() => expect(mocks.exit).toHaveBeenCalledWith(1));
    expect(console.error).toHaveBeenCalledWith('Failed to show startup error:', expect.any(Error));
  });

  it('observes reactivation load failure and deduplicates concurrent error dialogs', async () => {
    await import('../src/main/index.js');
    await vi.waitFor(() => expect(getActivateHandler()).toBeTypeOf('function'));
    mocks.loadFile.mockRejectedValue(null);
    getActivateHandler()();
    getActivateHandler()();
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledTimes(2));
    expect(mocks.showErrorBox).toHaveBeenCalledOnce();
    expect(mocks.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it('observes external URL rejection without terminating the workspace', async () => {
    await import('../src/main/index.js');
    await vi.waitFor(() => expect(getActivateHandler()).toBeTypeOf('function'));
    mocks.openExternal.mockRejectedValueOnce(null);
    expect(mocks.setWindowOpenHandler.mock.calls[0][0]({ url: 'https://example.com' })).toEqual({ action: 'deny' });
    await vi.waitFor(() => expect(console.error).toHaveBeenCalledWith('Failed to open external URL:', null));
    expect(mocks.exit).not.toHaveBeenCalled();
  });
});

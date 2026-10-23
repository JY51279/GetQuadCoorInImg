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
  openDevTools: vi.fn(),
  windows: [],
  isPackaged: true,
  is: { dev: false },
}));

vi.mock('electron', () => ({
  app: {
    whenReady: mocks.whenReady,
    on: mocks.on,
    exit: mocks.exit,
    quit: mocks.quit,
    get isPackaged() {
      return mocks.isPackaged;
    },
  },
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

const settle = () => new Promise(resolve => setImmediate(resolve));

function beginQuit() {
  mocks.on.mock.calls.find(([event]) => event === 'before-quit')?.[1]();
}

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.is.dev = false;
  mocks.isPackaged = true;
  mocks.windows.length = 0;
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
    const window = {
      on: vi.fn(),
      show: vi.fn(),
      isDestroyed: vi.fn(() => false),
      loadFile: mocks.loadFile,
      loadURL: mocks.loadURL,
      webContents: {
        on: vi.fn(),
        setZoomMode: vi.fn(),
        setZoomFactor: vi.fn(),
        setWindowOpenHandler: mocks.setWindowOpenHandler,
        openDevTools: mocks.openDevTools,
        session: { webRequest: { onHeadersReceived: vi.fn() } },
      },
    };
    mocks.windows.push(window);
    return window;
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Main-process startup failure boundaries (mocked Electron)', () => {
  it.each([
    { dev: false, rejects: true },
    { dev: true, rejects: true },
    { dev: false, rejects: false },
    { dev: true, rejects: false },
  ])('treats a destroyed loading window as cancellation and permits reopening: %j', async ({ dev, rejects }) => {
    mocks.is.dev = dev;
    mocks.isPackaged = false;
    vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173');
    let finishLoad;
    (dev ? mocks.loadURL : mocks.loadFile).mockImplementationOnce(
      () =>
        new Promise((resolve, reject) => {
          finishLoad = () =>
            rejects ? reject(Object.assign(new Error('load interrupted'), { code: 'ERR_FAILED' })) : resolve();
        }),
    );
    await import('../src/main/index.js');
    await vi.waitFor(() => expect(finishLoad).toBeTypeOf('function'));
    mocks.windows[0].isDestroyed.mockReturnValue(true);
    finishLoad();
    await settle();
    expect(mocks.showErrorBox).not.toHaveBeenCalled();
    expect(mocks.exit).not.toHaveBeenCalled();
    expect(mocks.openDevTools).not.toHaveBeenCalled();
    expect(getActivateHandler()).toBeTypeOf('function');
    getActivateHandler()();
    await settle();
    expect(mocks.BrowserWindow).toHaveBeenCalledTimes(2);
    expect(mocks.openDevTools).toHaveBeenCalledOnce();
  });

  it.each(['whenReady', 'initializeFileOperations', 'initializeWorkspaceSessionStore', 'initializeImageFileReader'])(
    'does not report a late %s rejection after quit has started',
    async boundary => {
      let rejectInitialization;
      mocks[boundary].mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            rejectInitialization = reject;
          }),
      );
      await import('../src/main/index.js');
      await vi.waitFor(() => expect(rejectInitialization).toBeTypeOf('function'));
      beginQuit();
      rejectInitialization(new Error('late startup error'));
      await settle();
      expect(mocks.showErrorBox).not.toHaveBeenCalled();
      expect(mocks.exit).not.toHaveBeenCalled();
      expect(mocks.BrowserWindow).not.toHaveBeenCalled();
    },
  );

  it('does not continue initialization after quit starts during a successful initialization step', async () => {
    let finishInitialization;
    mocks.initializeFileOperations.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          finishInitialization = resolve;
        }),
    );
    await import('../src/main/index.js');
    await vi.waitFor(() => expect(finishInitialization).toBeTypeOf('function'));
    beginQuit();
    finishInitialization();
    await settle();
    expect(mocks.initializeWorkspaceSessionStore).not.toHaveBeenCalled();
    expect(mocks.BrowserWindow).not.toHaveBeenCalled();
    expect(mocks.showErrorBox).not.toHaveBeenCalled();
  });

  it.each([true, false])(
    'ignores a late load settlement while quitting before window destruction (rejects: %s)',
    async rejects => {
      mocks.isPackaged = false;
      let finishLoad;
      mocks.loadFile.mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            finishLoad = () => (rejects ? reject(new Error('load interrupted by quit')) : resolve());
          }),
      );
      await import('../src/main/index.js');
      await vi.waitFor(() => expect(finishLoad).toBeTypeOf('function'));
      beginQuit();
      finishLoad();
      await settle();
      expect(mocks.windows[0].isDestroyed()).toBe(false);
      expect(mocks.showErrorBox).not.toHaveBeenCalled();
      expect(mocks.exit).not.toHaveBeenCalled();
      expect(mocks.openDevTools).not.toHaveBeenCalled();
      expect(getActivateHandler()).toBeUndefined();
    },
  );

  it('does not ignore an aborted load on a live window based on its error code alone', async () => {
    mocks.loadFile.mockRejectedValueOnce(Object.assign(new Error('navigation replaced'), { code: 'ERR_ABORTED' }));
    await import('../src/main/index.js');
    await vi.waitFor(() => expect(mocks.exit).toHaveBeenCalledWith(1));
    expect(mocks.showErrorBox).toHaveBeenCalledOnce();
  });

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

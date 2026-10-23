import { app, shell, BrowserWindow, nativeImage, net, protocol, dialog } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
import { initializeFileOperations } from './FileOperations.js';
import { registerIpcHandlers } from './IpcHandlers.js';
import { IMAGE_PROTOCOL_SCHEME, initializeImageFileReader, registerImageProtocol } from './ImageFileReader.js';
import { initializeWorkspaceSessionStore } from './WorkspaceSessionStore.js';
import { toUserErrorMessage } from '../shared/UserMessages.js';

protocol.registerSchemesAsPrivileged([
  {
    scheme: IMAGE_PROTOCOL_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

let startupFailed = false;
let isQuitting = false;

app.on('before-quit', () => {
  isQuitting = true;
});

function handleStartupFailure(error) {
  if (isQuitting) return;
  console.error('Application startup failed:', error);
  if (startupFailed) return;
  startupFailed = true;
  try {
    dialog.showErrorBox(
      'QuadTool 启动失败',
      toUserErrorMessage(error, '应用初始化或窗口加载失败，请检查文件访问权限后重新启动。'),
    );
  } catch (dialogError) {
    console.error('Failed to show startup error:', dialogError);
  } finally {
    app.exit(1);
  }
}

async function createWindow() {
  if (isQuitting || startupFailed) return;
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1600,
    minWidth: 810,
    height: 900,
    minHeight: 650,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });
  mainWindow.webContents.setZoomMode('isolated');
  mainWindow.webContents.setZoomFactor(1);

  mainWindow.webContents.on('will-prevent-unload', event => {
    const choice = dialog.showMessageBoxSync(mainWindow, {
      type: 'question',
      buttons: ['继续编辑', '离开'],
      defaultId: 0,
      cancelId: 0,
      title: '图片注解尚未完成',
      message: '图片注解正在生成或保存。',
      detail: '离开可能中断请求。确定离开？',
    });
    if (choice === 1) event.preventDefault();
    else isQuitting = false;
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(details => {
    shell.openExternal(details.url).catch(error => console.error('Failed to open external URL:', error));
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  try {
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
        callback({
          responseHeaders: {
            ...details.responseHeaders,
            'Content-Security-Policy': [`img-src 'self' data: blob: ${IMAGE_PROTOCOL_SCHEME}:;`],
          },
        });
      });
      await mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
    } else {
      await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
    }
  } catch (error) {
    // Destroying a window also rejects its pending load. This is not a startup failure.
    if (isQuitting || mainWindow.isDestroyed()) return;
    throw error;
  }
  if (isQuitting || mainWindow.isDestroyed()) return;
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
  //mainWindow.webContents.openDevTools();
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app
  .whenReady()
  .then(async () => {
    if (isQuitting) return;
    await initializeFileOperations(app);
    if (isQuitting) return;
    await initializeWorkspaceSessionStore(app);
    if (isQuitting) return;
    await initializeImageFileReader(app, nativeImage);
    if (isQuitting) return;
    registerImageProtocol(protocol, net);
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron');

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window);
    });
    registerIpcHandlers();
    await createWindow();
    if (isQuitting || startupFailed) return;

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow().catch(handleStartupFailure);
    });
  })
  .catch(handleStartupFailure);

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.

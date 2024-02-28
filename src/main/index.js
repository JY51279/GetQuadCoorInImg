import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
const fs = require('fs');
const path = require('path');
function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1920,
    minWidth: 810,
    height: 1080,
    minHeight: 1080,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(details => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
  mainWindow.webContents.openDevTools();
}

const imageExtensions = [
  'jpg',
  'jpeg',
  'png',
  'gif',
  'bmp',
  'tiff',
  'tif',
  'webp',
  'svg',
  'svgz',
  'ico',
  'hdr',
  'exr',
  'pbm',
  'pgm',
  'ppm',
  'pcx',
  'tga',
  'wbmp',
  'xbm',
  'xpm',
];
function openPicFile(event, filePath) {
  // 获取文件类型
  const extname = path.extname(filePath).slice(1);
  const mimeType = `image/${extname}`;
  // 组合 base64 数据和图片类型
  const imageDataURI = `data:${mimeType};base64,`;
  let base64 = imageDataURI;
  const stream = fs.createReadStream(filePath, { encoding: 'base64' });
  stream.on('data', chunk => {
    base64 += chunk; //TODO 完成分段传输
    if (base64.length > 1024 * 1024) {
      // 将数据分为多个部分发送
      const picInfo = { str: base64, fileName: '' };
      event.reply('open-pic-file-response', { success: true, picInfo });
      base64 = '';
    }
  });
  stream.on('end', () => {
    try {
      // 将base64编码字符串发送给渲染进程
      console.log('Suc Open Pic');
      const fileName = path.basename(filePath);
      const picInfo = { str: base64, path: filePath, fileName: fileName };
      event.reply('open-pic-file-response', { success: true, picInfo });
    } catch (error) {
      // 发生异常时，向渲染进程回复错误信息
      event.reply('open-pic-file-response', { success: false, error: error.message });
    }
  });
  stream.on('error', err => {
    // 发生错误时，向渲染进程回复错误信息
    event.reply('open-pic-file-response', { success: false, error: err.message });
  });
}
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron');

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });
  //IPC test
  ipcMain.setMaxListeners(20);
  ipcMain.on('open-image-file-dialog', event => {
    //console.log('ipcMain.on  open-json-file-dialog');
    dialog
      .showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'Image Files', extensions: imageExtensions }],
      })
      .then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
          // 发送选中文件的路径到渲染进程
          const filePath = result.filePaths[0];
          openPicFile(event, filePath);
        }
      })
      .catch(err => {
        console.error('Error while opening image file dialog:', err);
      });
  });
  ipcMain.on('open-pic-file', (event, filePath) => {
    openPicFile(event, filePath);
  });

  ipcMain.on('open-json-file-dialog', event => {
    //console.log('ipcMain.on  open-json-file-dialog');
    dialog
      .showOpenDialog({
        properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      })
      .then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
          // 发送选中文件的路径到渲染进程
          const filePath = result.filePaths[0];
          const fileName = path.basename(filePath);
          fs.readFile(filePath, 'utf-8', (err, data) => {
            if (err) {
              console.log('Fail Open Json');
              event.reply('choose-json-file-response', { success: false, error: err.message });
              return;
            }
            console.log('Suc Open Json');
            const jsonInfo = { str: data, path: filePath, fileName: fileName };
            event.reply('choose-json-file-response', { success: true, jsonInfo });
          });
        }
      })
      .catch(err => {
        console.error('Error while opening json file dialog:', err);
      });
  });
  ipcMain.on('save-json-file', (event, data) => {
    const filePath = data.path;
    const content = data.str;
    try {
      fs.writeFile(filePath, content, err => {
        if (err) {
          console.log('Fail Save Json');
          event.reply('save-json-file-response', { success: false, error: err.message });
        } else {
          console.log('Suc Save Json');
          event.reply('save-json-file-response', { success: true });
        }
      });
    } catch (err) {
      console.log('Error:', err.message);
      event.reply('save-json-file-response', { success: false, error: err.message });
    }
  });
  createWindow();

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

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

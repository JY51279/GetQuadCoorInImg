import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import icon from '../../resources/icon.png?asset';
const fs = require('fs');
const path = require('path');
const UTIF = require('utif');
const { PNG } = require('pngjs');
const sharp = require('sharp');

let jsonTempFileCounter = 0;
let lastJsonDirectory = '';
let dialogPathSettingsFile = '';

async function saveJsonFileAtomically(data) {
  if (!data || typeof data.path !== 'string' || data.path.length === 0) {
    throw new Error('Invalid JSON file path.');
  }
  if (typeof data.str !== 'string') {
    throw new Error('Invalid JSON content.');
  }

  JSON.parse(data.str);

  const filePath = data.path;
  const directory = path.dirname(filePath);
  const fileName = path.basename(filePath);
  const tempFilePath = path.join(
    directory,
    `.${fileName}.${process.pid}.${Date.now()}.${++jsonTempFileCounter}.tmp`,
  );

  try {
    await fs.promises.writeFile(tempFilePath, data.str, 'utf-8');
    await fs.promises.rename(tempFilePath, filePath);
  } catch (error) {
    try {
      await fs.promises.unlink(tempFilePath);
    } catch (cleanupError) {
      if (cleanupError.code !== 'ENOENT') {
        console.error('Failed to remove temporary JSON file:', cleanupError);
      }
    }
    throw error;
  }
}

function getExistingDirectory(directoryPath) {
  if (typeof directoryPath !== 'string' || directoryPath.length === 0) return '';
  try {
    return fs.statSync(directoryPath).isDirectory() ? directoryPath : '';
  } catch {
    return '';
  }
}

function getDefaultDialogDirectory() {
  return (
    getExistingDirectory(lastJsonDirectory) ||
    getExistingDirectory(app.getPath('documents')) ||
    app.getPath('home')
  );
}

async function loadDialogPathSettings() {
  dialogPathSettingsFile = path.join(app.getPath('userData'), 'dialog-paths.json');
  try {
    const settingsText = await fs.promises.readFile(dialogPathSettingsFile, 'utf-8');
    const settings = JSON.parse(settingsText);
    lastJsonDirectory = getExistingDirectory(settings.lastJsonDirectory);
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Failed to load dialog path settings:', error.message);
  }
}

async function saveDialogPathSettings() {
  if (!dialogPathSettingsFile) return;
  await saveJsonFileAtomically({
    path: dialogPathSettingsFile,
    str: JSON.stringify({ lastJsonDirectory }, null, 2),
  });
}

function resolveJsonImagePath(imagePath, jsonFilePath = '') {
  if (typeof imagePath !== 'string' || imagePath.length === 0) return '';
  if (path.isAbsolute(imagePath)) return path.normalize(imagePath);

  if (typeof jsonFilePath === 'string' && jsonFilePath.length > 0) {
    return path.resolve(path.dirname(jsonFilePath), imagePath);
  }
  return path.resolve(imagePath);
}

function getImageDialogDefaultDirectory(context) {
  const jsonFilePath = typeof context?.jsonFilePath === 'string' ? context.jsonFilePath : '';
  const imagePath = typeof context?.imagePath === 'string' ? context.imagePath : '';
  const resolvedImagePath = resolveJsonImagePath(imagePath, jsonFilePath);
  const imageDirectory = resolvedImagePath ? getExistingDirectory(path.dirname(resolvedImagePath)) : '';
  const jsonDirectory = jsonFilePath ? getExistingDirectory(path.dirname(jsonFilePath)) : '';
  return imageDirectory || jsonDirectory || getDefaultDialogDirectory();
}

function createWindow() {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1920,
    minWidth: 810,
    height: 1200,
    minHeight: 1200,
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
    mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
      callback({
        responseHeaders: {
          ...details.responseHeaders,
          'Content-Security-Policy': ["img-src 'self' data: blob:;"],
        },
      });
    });
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
  //mainWindow.webContents.openDevTools();
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
const CHUNK_SIZE = 1024 * 1024; // 8192; // 8KB
function sendBase64InChunks(event, buffer, filePath) {
  const base64 = buffer.toString('base64'); // 将 PNG Buffer 转换为 Base64
  const fileName = path.basename(filePath);
  const totalSize = base64.length;
  let startIndex = 0;
  // 手动加上 MIME 头
  event.reply('open-pic-file-response', {
    success: true,
    picInfo: { str: `data:image/png;base64,`, fileName: '' },
  });

  console.log('start send base64');
  while (startIndex < totalSize) {
    console.log('startIndex: ' + startIndex);
    const chunk = base64.slice(startIndex, startIndex + CHUNK_SIZE);

    event.reply('open-pic-file-response', {
      success: true,
      picInfo: { str: chunk, fileName: '' },
    });

    startIndex += CHUNK_SIZE;
  }

  console.log('end send base64');
  // **发送结束标志**
  event.reply('open-pic-file-response', {
    success: true,
    picInfo: { str: '', path: filePath, fileName: fileName },
  });
}

function openPicFile(event, filePath) {
  // 获取文件类型
  const extname = path.extname(filePath).slice(1).toLowerCase();
  if (!imageExtensions.includes(extname)) {
    event.reply('open-pic-file-response', {
      success: false,
      error: 'Unsupported image format',
      path: filePath,
    });
    return;
  }
  if (extname === 'tiff' || extname === 'tif') {
    fs.readFile(filePath, async (err, data) => {
      if (err) {
        event.reply('open-pic-file-response', { success: false, error: err.message, path: filePath });
        return;
      }
      try {
        // **尝试用 UTIF.js 解析**
        const tiffPages = UTIF.decode(data);
        // console.log('TIFF Metadata:', tiffPages[0]);

        const compressionType = tiffPages[0].t259 ? tiffPages[0].t259[0] : 'Unknown';
        // console.log('Compression Type:', compressionType);

        // **如果 TIFF 是不支持的压缩格式，直接跳到 sharp**
        if ([3, 4, 6].includes(compressionType)) {
          console.log('⚠ Unsupported compression detected, switching to sharp.');
          throw new Error('UTIF does not support this compression.');
        }

        // **解析 TIFF 数据**
        UTIF.decodeImage(data, tiffPages[0]);

        if (!tiffPages[0].data) {
          throw new Error('TIFF decoding failed: no image data found.');
        }

        const firstPageRGBA = UTIF.toRGBA8(tiffPages[0]);

        if (firstPageRGBA.length === 0) {
          throw new Error('UTIF failed: RGBA data is empty.');
        }

        // **用 pngjs 转换 TIFF → PNG**
        const png = new PNG({ width: tiffPages[0].width, height: tiffPages[0].height });
        png.data = Buffer.from(firstPageRGBA);

        const chunks = [];
        png
          .pack()
          .on('data', chunk => chunks.push(chunk))
          .on('end', () => {
            const pngBuffer = Buffer.concat(chunks);
            sendBase64InChunks(event, pngBuffer, filePath);
          });
      } catch (utifError) {
        // **如果 UTIF.js 失败，改用 sharp**
        console.log('UTIF failed, using Sharp as fallback.');
        try {
          const pngBuffer = await sharp(data).png().toBuffer();
          sendBase64InChunks(event, pngBuffer, filePath);
        } catch (sharpError) {
          event.reply('open-pic-file-response', {
            success: false,
            error: sharpError.message,
            path: filePath,
          });
        }
      }
    });
    return;
  }

  const mimeType = `image/${extname}`;
  // 组合 base64 数据和图片类型
  const imageDataURI = `data:${mimeType};base64,`;
  let base64 = imageDataURI;
  const stream = fs.createReadStream(filePath, { encoding: 'base64' });
  // 流式传输 减少内存占用
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
      event.reply('open-pic-file-response', { success: false, error: error.message, path: filePath });
    }
  });
  stream.on('error', err => {
    // 发生错误时，向渲染进程回复错误信息
    event.reply('open-pic-file-response', { success: false, error: err.message, path: filePath });
  });
}
// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  await loadDialogPathSettings();
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
  ipcMain.on('open-image-file-dialog', (event, context) => {
    //console.log('ipcMain.on  open-json-file-dialog');
    dialog
      .showOpenDialog({
        defaultPath: getImageDialogDefaultDirectory(context),
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
  ipcMain.on('open-pic-file', (event, request) => {
    const imagePath = typeof request === 'string' ? request : request?.imagePath;
    const jsonFilePath = typeof request === 'string' ? '' : request?.jsonFilePath;
    const resolvedImagePath = resolveJsonImagePath(imagePath, jsonFilePath);
    if (!resolvedImagePath) {
      event.reply('open-pic-file-response', { success: false, error: 'Invalid image path.', path: '' });
      return;
    }
    openPicFile(event, resolvedImagePath);
  });

  ipcMain.on('open-json-file-dialog', event => {
    //console.log('ipcMain.on  open-json-file-dialog');
    dialog
      .showOpenDialog({
        defaultPath: getDefaultDialogDirectory(),
        properties: ['openFile'],
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
      })
      .then(result => {
        if (!result.canceled && result.filePaths.length > 0) {
          // 发送选中文件的路径到渲染进程
          const filePath = result.filePaths[0];
          const fileName = path.basename(filePath);
          lastJsonDirectory = path.dirname(filePath);
          saveDialogPathSettings().catch(error => {
            console.error('Failed to save dialog path settings:', error.message);
          });
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
  ipcMain.handle('resolve-json-image-paths', (_event, data) => {
    try {
      if (!data || typeof data.jsonFilePath !== 'string' || !Array.isArray(data.imagePaths)) {
        throw new Error('Invalid image path resolution request.');
      }
      const imagePaths = data.imagePaths.map(imagePath =>
        resolveJsonImagePath(imagePath, data.jsonFilePath),
      );
      return { success: true, imagePaths };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
  ipcMain.handle('save-json-file', async (_event, data) => {
    try {
      await saveJsonFileAtomically(data);
      console.log('Suc Save Json');
      return { success: true };
    } catch (err) {
      console.error('Fail Save Json:', err.message);
      return { success: false, error: err.message };
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

import { dialog, ipcMain } from 'electron';
import {
  getDefaultDialogDirectory,
  getImageDialogDefaultDirectory,
  readJsonFile,
  rememberJsonDirectory,
  resolveJsonImagePath,
  saveJsonFileAtomically,
} from './FileOperations.js';
import { IMAGE_EXTENSIONS, sendImageFile } from './ImageFileReader.js';

function replyImageRequestFailure(event, error, requestId = null, canceled = false) {
  event.reply('open-pic-file-response', {
    success: false,
    requestId,
    error,
    path: '',
    ...(canceled ? { canceled: true } : {}),
  });
}

async function handleOpenImageDialog(event, context) {
  const requestId = context?.requestId ?? null;
  try {
    const result = await dialog.showOpenDialog({
      defaultPath: getImageDialogDefaultDirectory(context),
      properties: ['openFile'],
      filters: [{ name: 'Image Files', extensions: IMAGE_EXTENSIONS }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      replyImageRequestFailure(event, '', requestId, true);
      return;
    }
    await sendImageFile(event, result.filePaths[0], requestId);
  } catch (error) {
    console.error('Error while opening image file dialog:', error);
    replyImageRequestFailure(event, error.message, requestId);
  }
}

async function handleOpenJsonDialog(event) {
  try {
    const result = await dialog.showOpenDialog({
      defaultPath: getDefaultDialogDirectory(),
      properties: ['openFile'],
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });

    if (result.canceled || result.filePaths.length === 0) return;

    const filePath = result.filePaths[0];
    rememberJsonDirectory(filePath).catch(error => {
      console.error('Failed to save dialog path settings:', error.message);
    });

    try {
      const jsonInfo = await readJsonFile(filePath);
      event.reply('choose-json-file-response', { success: true, jsonInfo });
    } catch (error) {
      event.reply('choose-json-file-response', { success: false, error: error.message });
    }
  } catch (error) {
    console.error('Error while opening JSON file dialog:', error);
  }
}

export function registerIpcHandlers() {
  ipcMain.on('open-image-file-dialog', handleOpenImageDialog);

  ipcMain.on('open-pic-file', (event, request) => {
    const imagePath = typeof request === 'string' ? request : request?.imagePath;
    const jsonFilePath = typeof request === 'string' ? '' : request?.jsonFilePath;
    const requestId = typeof request === 'string' ? null : request?.requestId ?? null;
    const resolvedImagePath = resolveJsonImagePath(imagePath, jsonFilePath);
    if (!resolvedImagePath) {
      replyImageRequestFailure(event, 'Invalid image path.', requestId);
      return;
    }
    void sendImageFile(event, resolvedImagePath, requestId);
  });

  ipcMain.on('open-json-file-dialog', handleOpenJsonDialog);

  ipcMain.handle('resolve-json-image-paths', (_event, data) => {
    try {
      if (!data || typeof data.jsonFilePath !== 'string' || !Array.isArray(data.imagePaths)) {
        throw new Error('Invalid image path resolution request.');
      }
      const imagePaths = data.imagePaths.map(imagePath => resolveJsonImagePath(imagePath, data.jsonFilePath));
      return { success: true, imagePaths };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('save-json-file', async (_event, data) => {
    try {
      await saveJsonFileAtomically(data);
      return { success: true };
    } catch (error) {
      console.error('Failed to save JSON:', error.message);
      return { success: false, error: error.message };
    }
  });
}

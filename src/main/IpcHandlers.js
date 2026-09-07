import { dialog, ipcMain } from 'electron';
import {
  getDefaultDialogDirectory,
  getImageDialogDefaultDirectory,
  readJsonFile,
  rememberJsonDirectory,
  resolveJsonImagePath,
  saveJsonFileAtomically,
} from './FileOperations.js';
import { IMAGE_EXTENSIONS, prepareImageFile } from './ImageFileReader.js';

export async function handleOpenImageDialog(_event, context) {
  const requestId = context?.requestId ?? null;
  let selectedPath = '';
  try {
    const result = await dialog.showOpenDialog({
      defaultPath: getImageDialogDefaultDirectory(context),
      properties: ['openFile'],
      filters: [{ name: 'Image Files', extensions: IMAGE_EXTENSIONS }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true, requestId };
    }
    selectedPath = result.filePaths[0];
    const imageInfo = await prepareImageFile(selectedPath);
    return { success: true, requestId, imageInfo };
  } catch (error) {
    console.error('Error while opening image file dialog:', error);
    return { success: false, requestId, error: error.message, path: selectedPath };
  }
}

export async function handlePrepareImage(_event, request) {
  const imagePath = typeof request === 'string' ? request : request?.imagePath;
  const jsonFilePath = typeof request === 'string' ? '' : request?.jsonFilePath;
  const requestId = typeof request === 'string' ? null : request?.requestId ?? null;
  const resolvedImagePath = resolveJsonImagePath(imagePath, jsonFilePath);
  if (!resolvedImagePath) {
    return { success: false, requestId, error: 'Invalid image path.', path: '' };
  }

  try {
    const imageInfo = await prepareImageFile(resolvedImagePath);
    return { success: true, requestId, imageInfo };
  } catch (error) {
    return { success: false, requestId, error: error.message, path: resolvedImagePath };
  }
}

export async function handleOpenJsonDialog(event, context) {
  const requestId = context?.requestId ?? null;
  try {
    const result = await dialog.showOpenDialog({
      defaultPath: getDefaultDialogDirectory(),
      properties: ['openFile'],
      filters: [{ name: 'JSON Files', extensions: ['json'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      event.reply('choose-json-file-response', { success: false, canceled: true, requestId });
      return;
    }

    const filePath = result.filePaths[0];
    rememberJsonDirectory(filePath).catch(error => {
      console.error('Failed to save dialog path settings:', error.message);
    });

    try {
      const jsonInfo = await readJsonFile(filePath);
      event.reply('choose-json-file-response', { success: true, requestId, jsonInfo });
    } catch (error) {
      event.reply('choose-json-file-response', { success: false, requestId, error: error.message });
    }
  } catch (error) {
    console.error('Error while opening JSON file dialog:', error);
    event.reply('choose-json-file-response', { success: false, requestId, error: error.message });
  }
}

export function registerIpcHandlers() {
  ipcMain.handle('open-image-file-dialog', handleOpenImageDialog);
  ipcMain.handle('prepare-image', handlePrepareImage);

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
      const result = await saveJsonFileAtomically(data);
      return { success: true, ...result };
    } catch (error) {
      console.error('Failed to save JSON:', error.message);
      return { success: false, error: error.message };
    }
  });
}

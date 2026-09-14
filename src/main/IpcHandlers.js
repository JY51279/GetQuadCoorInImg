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
import { USER_MESSAGES, toUserErrorMessage } from '../shared/UserMessages.js';

export async function handleOpenImageDialog(_event, context) {
  const requestId = context?.requestId ?? null;
  let selectedPath = '';
  try {
    const result = await dialog.showOpenDialog({
      defaultPath: getImageDialogDefaultDirectory(context),
      properties: ['openFile'],
      filters: [{ name: '图片文件', extensions: IMAGE_EXTENSIONS }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true, requestId };
    }
    selectedPath = result.filePaths[0];
    const imageInfo = await prepareImageFile(selectedPath);
    return { success: true, requestId, imageInfo };
  } catch (error) {
    console.error('Error while opening image file dialog:', error);
    return {
      success: false,
      requestId,
      error: toUserErrorMessage(error, USER_MESSAGES.IMAGE_OPEN_FAILED),
      path: selectedPath,
    };
  }
}

export async function handlePrepareImage(_event, request) {
  const imagePath = typeof request === 'string' ? request : request?.imagePath;
  const jsonFilePath = typeof request === 'string' ? '' : request?.jsonFilePath;
  const requestId = typeof request === 'string' ? null : request?.requestId ?? null;
  const resolvedImagePath = resolveJsonImagePath(imagePath, jsonFilePath);
  if (!resolvedImagePath) {
    return { success: false, requestId, error: '图片路径无效。', path: '' };
  }

  try {
    const imageInfo = await prepareImageFile(resolvedImagePath);
    return { success: true, requestId, imageInfo };
  } catch (error) {
    console.error('Failed to prepare image:', error);
    return {
      success: false,
      requestId,
      error: toUserErrorMessage(error, USER_MESSAGES.IMAGE_READ_FAILED),
      path: resolvedImagePath,
    };
  }
}

export async function handleOpenJsonDialog(event, context) {
  const requestId = context?.requestId ?? null;
  try {
    const result = await dialog.showOpenDialog({
      defaultPath: getDefaultDialogDirectory(),
      properties: ['openFile'],
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
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
      console.error('Failed to read JSON file:', error);
      event.reply('choose-json-file-response', {
        success: false,
        requestId,
        error: toUserErrorMessage(error, USER_MESSAGES.JSON_READ_FAILED),
      });
    }
  } catch (error) {
    console.error('Error while opening JSON file dialog:', error);
    event.reply('choose-json-file-response', {
      success: false,
      requestId,
      error: toUserErrorMessage(error, USER_MESSAGES.JSON_OPEN_FAILED),
    });
  }
}

export function handleResolveJsonImagePaths(_event, data) {
  try {
    if (!data || typeof data.jsonFilePath !== 'string' || !Array.isArray(data.imagePaths)) {
      throw new Error('图片路径解析请求无效。');
    }
    const imagePaths = data.imagePaths.map(imagePath => resolveJsonImagePath(imagePath, data.jsonFilePath));
    return { success: true, imagePaths };
  } catch (error) {
    console.error('Failed to resolve JSON image paths:', error);
    return { success: false, error: toUserErrorMessage(error, USER_MESSAGES.IMAGE_PATH_RESOLUTION_FAILED) };
  }
}

export async function handleSaveJsonFile(_event, data) {
  try {
    const result = await saveJsonFileAtomically(data);
    return { success: true, ...result };
  } catch (error) {
    console.error('Failed to save JSON:', error.message);
    return { success: false, error: toUserErrorMessage(error, USER_MESSAGES.JSON_SAVE_FAILED) };
  }
}

export function registerIpcHandlers() {
  ipcMain.handle('open-image-file-dialog', handleOpenImageDialog);
  ipcMain.handle('prepare-image', handlePrepareImage);

  ipcMain.on('open-json-file-dialog', handleOpenJsonDialog);

  ipcMain.handle('resolve-json-image-paths', handleResolveJsonImagePaths);
  ipcMain.handle('save-json-file', handleSaveJsonFile);
}

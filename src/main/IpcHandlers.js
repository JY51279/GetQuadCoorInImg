import { dialog, ipcMain } from 'electron';
import {
  getDefaultDialogDirectory,
  getImageDialogDefaultDirectory,
  getAdjacentJsonFilePath,
  readJsonFile,
  rememberJsonDirectory,
  resolveJsonImagePath,
  saveJsonFileAtomically,
} from './FileOperations.js';
import { IMAGE_EXTENSIONS, prepareImageFile } from './ImageFileReader.js';
import { DATASET_FILE_STATUS, createDatasetTarget } from '../shared/DatasetFileResponse.js';
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

async function createJsonFileResponse(filePath, requestId, fallbackMessage = USER_MESSAGES.JSON_READ_FAILED) {
  const target = createDatasetTarget(filePath);
  try {
    const jsonInfo = await readJsonFile(filePath);
    return {
      requestId,
      status: DATASET_FILE_STATUS.READY,
      target: createDatasetTarget(jsonInfo.path, jsonInfo.fileName),
      jsonInfo: { str: jsonInfo.str },
      error: '',
    };
  } catch (error) {
    console.error('Failed to read JSON file:', error);
    return {
      requestId,
      status: DATASET_FILE_STATUS.FAILED,
      target,
      jsonInfo: null,
      error: toUserErrorMessage(error, fallbackMessage),
    };
  }
}

export async function handleReadJsonFile(_event, request) {
  return createJsonFileResponse(request?.filePath, request?.requestId ?? null);
}

export async function handleOpenJsonDialog(_event, context) {
  const requestId = context?.requestId ?? null;
  try {
    const result = await dialog.showOpenDialog({
      defaultPath: getDefaultDialogDirectory(),
      properties: ['openFile'],
      filters: [{ name: 'JSON 文件', extensions: ['json'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return {
        requestId,
        status: DATASET_FILE_STATUS.CANCELED,
        target: null,
        jsonInfo: null,
        error: '',
      };
    }

    const filePath = result.filePaths[0];
    rememberJsonDirectory(filePath).catch(error => {
      console.error('Failed to save dialog path settings:', error.message);
    });
    return createJsonFileResponse(filePath, requestId);
  } catch (error) {
    console.error('Error while opening JSON file dialog:', error);
    return {
      requestId,
      status: DATASET_FILE_STATUS.FAILED,
      target: null,
      jsonInfo: null,
      error: toUserErrorMessage(error, USER_MESSAGES.JSON_OPEN_FAILED),
    };
  }
}

export async function handleOpenAdjacentJson(_event, request) {
  const requestId = request?.requestId ?? null;
  try {
    const targetPath = await getAdjacentJsonFilePath(request?.currentFilePath, request?.direction);
    return createJsonFileResponse(targetPath, requestId, USER_MESSAGES.DATASET_SWITCH_FAILED);
  } catch (error) {
    console.error('Failed to open adjacent JSON file:', error);
    return {
      requestId,
      status: DATASET_FILE_STATUS.FAILED,
      target: null,
      jsonInfo: null,
      error: toUserErrorMessage(error, USER_MESSAGES.DATASET_SWITCH_FAILED),
    };
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
  ipcMain.handle('open-json-file-dialog', handleOpenJsonDialog);
  ipcMain.handle('open-adjacent-json-file', handleOpenAdjacentJson);
  ipcMain.handle('read-json-file', handleReadJsonFile);

  ipcMain.handle('resolve-json-image-paths', handleResolveJsonImagePaths);
  ipcMain.handle('save-json-file', handleSaveJsonFile);
}

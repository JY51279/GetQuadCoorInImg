import { IPC_CHANNELS } from '../shared/IpcChannels.js';
import { app, dialog, ipcMain } from 'electron';
import { normalizeAnnotation } from './AnnotationService.js';
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
import {
  getWorkspaceSession,
  recordWorkspaceDatasetImage,
  recordWorkspaceDatasetTarget,
} from './WorkspaceSessionStore.js';
import { DATASET_FILE_STATUS, createDatasetTarget } from '../shared/DatasetFileResponse.js';
import { USER_MESSAGES, toUserErrorMessage } from '../shared/UserMessages.js';
import { isJsonSaveRequest } from '../shared/JsonSaveResult.js';
import { isFilePath, isRecord, isRequestId, serviceFailure, SERVICE_ERROR_KIND } from '../shared/ServiceResult.js';

function invalidDatasetRequest(requestId, error) {
  return {
    requestId,
    status: DATASET_FILE_STATUS.FAILED,
    target: null,
    jsonInfo: null,
    error,
    errorKind: SERVICE_ERROR_KIND.INVALID_REQUEST,
  };
}

export async function handleOpenImageDialog(_event, context) {
  const requestId = context?.requestId ?? null;
  if (!isRequestId(requestId)) {
    return {
      ...serviceFailure(null, '图片选择请求标识无效。', SERVICE_ERROR_KIND.INVALID_REQUEST),
      requestId,
      path: '',
    };
  }
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
  const requestId = request?.requestId ?? null;
  if (
    !isRecord(request) ||
    !isRequestId(requestId) ||
    !isFilePath(request.imagePath) ||
    (request.jsonFilePath !== undefined && request.jsonFilePath !== '' && !isFilePath(request.jsonFilePath))
  ) {
    return { ...serviceFailure(null, '图片路径无效。', SERVICE_ERROR_KIND.INVALID_REQUEST), requestId, path: '' };
  }
  let resolvedImagePath = '';
  try {
    resolvedImagePath = resolveJsonImagePath(request.imagePath, request.jsonFilePath);
    if (!isFilePath(resolvedImagePath)) throw new Error('图片路径无效。');
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
  if (!isRecord(request) || !isRequestId(request.requestId) || !isFilePath(request.filePath)) {
    return invalidDatasetRequest(request?.requestId ?? null, '图集读取请求无效。');
  }
  return createJsonFileResponse(request?.filePath, request?.requestId ?? null);
}

export async function handleOpenJsonDialog(_event, context) {
  const requestId = context?.requestId ?? null;
  if (!isRequestId(requestId)) return invalidDatasetRequest(requestId, '图集选择请求标识无效。');
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
      console.error('Failed to save dialog path settings:', error);
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
  if (
    !isRecord(request) ||
    !isRequestId(requestId) ||
    !isFilePath(request.currentFilePath) ||
    !['previous', 'next'].includes(request.direction)
  ) {
    return invalidDatasetRequest(requestId, '相邻图集请求无效。');
  }
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
  if (
    !isRecord(data) ||
    !isFilePath(data.jsonFilePath) ||
    !Array.isArray(data.imagePaths) ||
    !data.imagePaths.every(isFilePath)
  ) {
    return serviceFailure(null, '图片路径解析请求无效。', SERVICE_ERROR_KIND.INVALID_REQUEST);
  }
  try {
    const imagePaths = data.imagePaths.map(imagePath => resolveJsonImagePath(imagePath, data.jsonFilePath));
    return { success: true, imagePaths };
  } catch (error) {
    console.error('Failed to resolve JSON image paths:', error);
    return { success: false, error: toUserErrorMessage(error, USER_MESSAGES.IMAGE_PATH_RESOLUTION_FAILED) };
  }
}

export async function handleSaveJsonFile(_event, data) {
  if (!isJsonSaveRequest(data)) return serviceFailure(null, 'JSON 保存请求无效。', SERVICE_ERROR_KIND.INVALID_REQUEST);
  try {
    const result = await saveJsonFileAtomically(data);
    return { success: true, ...result };
  } catch (error) {
    console.error('Failed to save JSON:', error);
    return { success: false, error: toUserErrorMessage(error, USER_MESSAGES.JSON_SAVE_FAILED) };
  }
}

export async function handleGetWorkspaceSession() {
  try {
    return { success: true, session: await getWorkspaceSession() };
  } catch (error) {
    console.error('Failed to load workspace session:', error);
    return { ...serviceFailure(error, '读取上次工作区记录失败。'), session: null };
  }
}

export async function handleRecordWorkspaceDataset(_event, request) {
  if (!isRecord(request) || !isFilePath(request.datasetPath)) {
    return {
      ...serviceFailure(null, '工作区记录缺少有效的图集路径。', SERVICE_ERROR_KIND.INVALID_REQUEST),
      session: null,
    };
  }
  try {
    const result = await recordWorkspaceDatasetTarget(request?.datasetPath);
    return { success: true, ...result };
  } catch (error) {
    console.error('Failed to record workspace dataset:', error);
    return { success: false, session: null, error: '保存工作区图集记录失败。' };
  }
}

export async function handleRecordWorkspaceImage(_event, request) {
  if (
    !isRecord(request) ||
    !isFilePath(request.datasetPath) ||
    !isFilePath(request.imagePath) ||
    !Number.isSafeInteger(request.imageIndex) ||
    request.imageIndex < 0
  ) {
    return { ...serviceFailure(null, '工作区图片记录无效。', SERVICE_ERROR_KIND.INVALID_REQUEST), session: null };
  }
  try {
    const result = await recordWorkspaceDatasetImage(request);
    return { success: true, ...result };
  } catch (error) {
    console.error('Failed to record workspace image:', error);
    return { success: false, session: null, error: '保存工作区图片记录失败。' };
  }
}

export async function handleNormalizeAnnotation(_event, request) {
  if (
    !isRecord(request) ||
    !isRequestId(request.requestId) ||
    typeof request.text !== 'string' ||
    !request.text.trim()
  ) {
    return {
      ...serviceFailure(null, '注解请求无效，请提供请求标识和非空人工描述。', SERVICE_ERROR_KIND.INVALID_REQUEST),
      requestId: isRequestId(request?.requestId) ? request.requestId : null,
      usage: null,
    };
  }
  // Only the text reaches the model service; requestId remains local and lets
  // the future panel associate an asynchronous response with its submission.
  const requestId = request.requestId;
  const result = await normalizeAnnotation(request.text, { appPath: app.getAppPath() });
  return { ...result, requestId };
}

export function registerIpcHandlers() {
  ipcMain.handle(IPC_CHANNELS.OPEN_IMAGE, handleOpenImageDialog);
  ipcMain.handle(IPC_CHANNELS.PREPARE_IMAGE, handlePrepareImage);
  ipcMain.handle(IPC_CHANNELS.OPEN_DATASET, handleOpenJsonDialog);
  ipcMain.handle(IPC_CHANNELS.ADJACENT_DATASET, handleOpenAdjacentJson);
  ipcMain.handle(IPC_CHANNELS.READ_DATASET, handleReadJsonFile);

  ipcMain.handle(IPC_CHANNELS.RESOLVE_IMAGE_PATHS, handleResolveJsonImagePaths);
  ipcMain.handle(IPC_CHANNELS.SAVE_JSON, handleSaveJsonFile);
  ipcMain.handle(IPC_CHANNELS.GET_WORKSPACE, handleGetWorkspaceSession);
  ipcMain.handle(IPC_CHANNELS.RECORD_DATASET, handleRecordWorkspaceDataset);
  ipcMain.handle(IPC_CHANNELS.RECORD_IMAGE, handleRecordWorkspaceImage);
  ipcMain.handle(IPC_CHANNELS.NORMALIZE_ANNOTATION, handleNormalizeAnnotation);
}

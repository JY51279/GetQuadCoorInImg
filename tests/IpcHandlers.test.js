import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DATASET_FILE_STATUS } from '../src/shared/DatasetFileResponse.js';

const electronMocks = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  on: vi.fn(),
  handle: vi.fn(),
}));

const fileOperationMocks = vi.hoisted(() => ({
  getAdjacentJsonFilePath: vi.fn(),
  getDefaultDialogDirectory: vi.fn(),
  getImageDialogDefaultDirectory: vi.fn(),
  readJsonFile: vi.fn(),
  rememberJsonDirectory: vi.fn(),
  resolveJsonImagePath: vi.fn(),
  saveJsonFileAtomically: vi.fn(),
}));

const imageReaderMocks = vi.hoisted(() => ({
  loadAnnotationRegionImages: vi.fn(),
  prepareAnnotationImages: vi.fn(),
  prepareImageFile: vi.fn(),
}));

const workspaceSessionMocks = vi.hoisted(() => ({
  getWorkspaceSession: vi.fn(),
  recordWorkspaceDatasetImage: vi.fn(),
  recordWorkspaceDatasetTarget: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: { showOpenDialog: electronMocks.showOpenDialog },
  ipcMain: { on: electronMocks.on, handle: electronMocks.handle },
}));

vi.mock('../src/main/FileOperations.js', () => fileOperationMocks);
vi.mock('../src/main/ImageFileReader.js', () => ({
  IMAGE_EXTENSIONS: ['png'],
  loadAnnotationRegionImages: imageReaderMocks.loadAnnotationRegionImages,
  prepareAnnotationImages: imageReaderMocks.prepareAnnotationImages,
  prepareImageFile: imageReaderMocks.prepareImageFile,
}));
vi.mock('../src/main/WorkspaceSessionStore.js', () => workspaceSessionMocks);

import {
  handleOpenAdjacentJson,
  handleOpenImageDialog,
  handleOpenJsonDialog,
  handlePrepareImage,
  handlePrepareAnnotationImages,
  handleReadJsonFile,
  handleResolveJsonImagePaths,
  handleSaveJsonFile,
  handleGetWorkspaceSession,
  handleRecordWorkspaceDataset,
  handleRecordWorkspaceImage,
  handleNormalizeAnnotation,
  handleNormalizeVisualAnnotation,
  handleLoadAnnotations,
  handleGenerateAndSaveAnnotation,
  registerIpcHandlers,
} from '../src/main/IpcHandlers.js';

describe('Main-process IPC handlers', () => {
  it.each([
    null,
    {},
    { path: ' ', str: '{}' },
    { path: 'test.json', str: 42 },
    { path: 'test.json', str: '{}', backupOriginal: 'yes' },
  ])('rejects invalid writes before filesystem access: %j', async request => {
    await expect(handleSaveJsonFile(null, request)).resolves.toMatchObject({
      success: false,
      errorKind: 'invalid-request',
    });
    expect(fileOperationMocks.saveJsonFileAtomically).not.toHaveBeenCalled();
  });

  it('rejects invalid read, dialog, navigation and checkpoint requests before side effects', async () => {
    await expect(handleReadJsonFile(null, { requestId: 1, filePath: null })).resolves.toMatchObject({
      status: 'failed',
      errorKind: 'invalid-request',
    });
    await expect(handleOpenJsonDialog(null, { requestId: '1' })).resolves.toMatchObject({
      status: 'failed',
      errorKind: 'invalid-request',
    });
    await expect(handleOpenImageDialog(null, {})).resolves.toMatchObject({
      success: false,
      errorKind: 'invalid-request',
    });
    await expect(
      handleOpenAdjacentJson(null, { requestId: 1, currentFilePath: 'test.json', direction: 'sideways' }),
    ).resolves.toMatchObject({ status: 'failed', errorKind: 'invalid-request' });
    await expect(handleRecordWorkspaceDataset(null, {})).resolves.toMatchObject({
      success: false,
      errorKind: 'invalid-request',
    });
    await expect(handleRecordWorkspaceImage(null, null)).resolves.toMatchObject({
      success: false,
      errorKind: 'invalid-request',
    });
    expect(handleResolveJsonImagePaths(null, { jsonFilePath: 'test.json', imagePaths: [42] })).toMatchObject({
      success: false,
      errorKind: 'invalid-request',
    });
    expect(fileOperationMocks.readJsonFile).not.toHaveBeenCalled();
    expect(fileOperationMocks.getAdjacentJsonFilePath).not.toHaveBeenCalled();
    expect(fileOperationMocks.resolveJsonImagePath).not.toHaveBeenCalled();
    expect(electronMocks.showOpenDialog).not.toHaveBeenCalled();
    expect(workspaceSessionMocks.recordWorkspaceDatasetTarget).not.toHaveBeenCalled();
    expect(workspaceSessionMocks.recordWorkspaceDatasetImage).not.toHaveBeenCalled();
  });

  it('contains path-resolution throws inside the image IPC boundary', async () => {
    fileOperationMocks.resolveJsonImagePath.mockImplementationOnce(() => {
      throw null;
    });
    await expect(handlePrepareImage(null, { requestId: 1, imagePath: 'one.png' })).resolves.toMatchObject({
      success: false,
      requestId: 1,
    });
    expect(imageReaderMocks.prepareImageFile).not.toHaveBeenCalled();
  });

  it('contains non-Error save and session rejections', async () => {
    fileOperationMocks.saveJsonFileAtomically.mockRejectedValueOnce(null);
    workspaceSessionMocks.getWorkspaceSession.mockRejectedValueOnce(undefined);
    await expect(handleSaveJsonFile(null, { path: 'test.json', str: '{}' })).resolves.toMatchObject({ success: false });
    await expect(handleGetWorkspaceSession()).resolves.toMatchObject({ success: false, session: null });
  });
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fileOperationMocks.getDefaultDialogDirectory.mockReturnValue('C:/datasets');
    fileOperationMocks.getImageDialogDefaultDirectory.mockReturnValue('C:/images');
    fileOperationMocks.rememberJsonDirectory.mockResolvedValue(undefined);
    fileOperationMocks.resolveJsonImagePath.mockImplementation(path => path);
    workspaceSessionMocks.getWorkspaceSession.mockResolvedValue(null);
    workspaceSessionMocks.recordWorkspaceDatasetTarget.mockResolvedValue({
      changed: true,
      stale: false,
      session: null,
    });
    workspaceSessionMocks.recordWorkspaceDatasetImage.mockResolvedValue({
      changed: true,
      stale: false,
      session: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the request id when the JSON dialog is canceled', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await expect(handleOpenJsonDialog(null, { requestId: 41 })).resolves.toEqual({
      requestId: 41,
      status: DATASET_FILE_STATUS.CANCELED,
      target: null,
      jsonInfo: null,
      error: '',
    });
    expect(fileOperationMocks.readJsonFile).not.toHaveBeenCalled();
  });

  it('reads the selected JSON file and remembers its directory', async () => {
    const jsonInfo = { path: 'C:/datasets/sample.json', str: '{}', fileName: 'sample.json' };
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/datasets/sample.json'],
    });
    fileOperationMocks.readJsonFile.mockResolvedValue(jsonInfo);

    await expect(handleOpenJsonDialog(null, { requestId: 42 })).resolves.toEqual({
      requestId: 42,
      status: DATASET_FILE_STATUS.READY,
      target: { path: jsonInfo.path, fileName: jsonInfo.fileName },
      jsonInfo: { str: jsonInfo.str },
      error: '',
    });
    expect(fileOperationMocks.rememberJsonDirectory).toHaveBeenCalledWith('C:/datasets/sample.json');
  });

  it('returns a structured response when the selected JSON file cannot be read', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/datasets/broken.json'],
    });
    fileOperationMocks.readJsonFile.mockRejectedValue(new Error('read failed'));

    await expect(handleOpenJsonDialog(null, { requestId: 43 })).resolves.toEqual({
      requestId: 43,
      status: DATASET_FILE_STATUS.FAILED,
      target: { path: 'C:/datasets/broken.json', fileName: 'broken.json' },
      jsonInfo: null,
      error: '读取 JSON 文件失败。',
    });
  });

  it('returns the request id when opening the JSON dialog fails', async () => {
    electronMocks.showOpenDialog.mockRejectedValue(new Error('dialog failed'));

    await expect(handleOpenJsonDialog(null, { requestId: 44 })).resolves.toEqual({
      requestId: 44,
      status: DATASET_FILE_STATUS.FAILED,
      target: null,
      jsonInfo: null,
      error: '打开 JSON 文件选择窗口失败。',
    });
  });

  it('returns the adjacent JSON file with the original request context', async () => {
    const jsonInfo = { path: 'C:/datasets/atlas10.json', str: '{}', fileName: 'atlas10.json' };
    fileOperationMocks.getAdjacentJsonFilePath.mockResolvedValue(jsonInfo.path);
    fileOperationMocks.readJsonFile.mockResolvedValue(jsonInfo);

    await expect(
      handleOpenAdjacentJson(null, {
        currentFilePath: 'C:/datasets/atlas1.json',
        direction: 'next',
        requestId: 45,
      }),
    ).resolves.toEqual({
      requestId: 45,
      status: DATASET_FILE_STATUS.READY,
      target: { path: jsonInfo.path, fileName: jsonInfo.fileName },
      jsonInfo: { str: jsonInfo.str },
      error: '',
    });
    expect(fileOperationMocks.getAdjacentJsonFilePath).toHaveBeenCalledWith('C:/datasets/atlas1.json', 'next');
    expect(fileOperationMocks.readJsonFile).toHaveBeenCalledWith(jsonInfo.path);
  });

  it('preserves a user-facing adjacent-JSON error', async () => {
    fileOperationMocks.getAdjacentJsonFilePath.mockRejectedValue(new Error('当前目录没有其他图集。'));

    await expect(
      handleOpenAdjacentJson(null, {
        currentFilePath: 'C:/datasets/only.json',
        direction: 'next',
        requestId: 46,
      }),
    ).resolves.toEqual({
      requestId: 46,
      status: DATASET_FILE_STATUS.FAILED,
      target: null,
      jsonInfo: null,
      error: '当前目录没有其他图集。',
    });
  });

  it('reports the adjacent target path when that JSON file cannot be read', async () => {
    fileOperationMocks.getAdjacentJsonFilePath.mockResolvedValue('C:/datasets/broken.json');
    fileOperationMocks.readJsonFile.mockRejectedValue(new Error('read failed'));

    await expect(
      handleOpenAdjacentJson(null, {
        currentFilePath: 'C:/datasets/current.json',
        direction: 'next',
        requestId: 47,
      }),
    ).resolves.toEqual({
      requestId: 47,
      status: DATASET_FILE_STATUS.FAILED,
      target: { path: 'C:/datasets/broken.json', fileName: 'broken.json' },
      jsonInfo: null,
      error: '切换图集失败。',
    });
  });

  it('uses the same JSON reader response for a known file path', async () => {
    const jsonInfo = { path: 'C:/datasets/restored.json', str: '{}', fileName: 'restored.json' };
    fileOperationMocks.readJsonFile.mockResolvedValue(jsonInfo);

    await expect(handleReadJsonFile(null, { filePath: jsonInfo.path, requestId: 48 })).resolves.toEqual({
      requestId: 48,
      status: DATASET_FILE_STATUS.READY,
      target: { path: jsonInfo.path, fileName: jsonInfo.fileName },
      jsonInfo: { str: jsonInfo.str },
      error: '',
    });
  });

  it('prepares the image selected by the image dialog', async () => {
    const imageInfo = { path: 'C:/images/one.png', url: 'prepared-image' };
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [imageInfo.path] });
    imageReaderMocks.prepareImageFile.mockResolvedValue(imageInfo);

    await expect(handleOpenImageDialog(null, { requestId: 51 })).resolves.toEqual({
      success: true,
      requestId: 51,
      imageInfo,
    });
    expect(imageReaderMocks.prepareImageFile).toHaveBeenCalledWith(imageInfo.path);
  });

  it('preserves cancellation context for the image dialog', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });

    await expect(handleOpenImageDialog(null, { requestId: 52 })).resolves.toEqual({
      success: false,
      canceled: true,
      requestId: 52,
    });
    expect(imageReaderMocks.prepareImageFile).not.toHaveBeenCalled();
  });

  it('resolves and prepares a dataset-relative image path', async () => {
    const imageInfo = { path: 'C:/datasets/images/one.png', url: 'prepared-image' };
    fileOperationMocks.resolveJsonImagePath.mockReturnValue(imageInfo.path);
    imageReaderMocks.prepareImageFile.mockResolvedValue(imageInfo);

    await expect(
      handlePrepareImage(null, {
        requestId: 53,
        imagePath: 'images/one.png',
        jsonFilePath: 'C:/datasets/sample.json',
      }),
    ).resolves.toEqual({ success: true, requestId: 53, imageInfo });
    expect(fileOperationMocks.resolveJsonImagePath).toHaveBeenCalledWith('images/one.png', 'C:/datasets/sample.json');
  });

  it('prepares annotation crops through the original-image reader', async () => {
    const prepared = {
      imageSize: { width: 100, height: 80 },
      regions: [{ regionIndex: 0, label: '区域 1（左上）' }],
    };
    imageReaderMocks.prepareAnnotationImages.mockResolvedValue(prepared);
    const request = {
      requestId: 55,
      imagePath: 'C:/images/one.png',
      quads: [{ regionIndex: 0, points: [{ x: 1, y: 1 }] }],
    };

    await expect(handlePrepareAnnotationImages(null, request)).resolves.toEqual({
      success: true,
      requestId: 55,
      ...prepared,
    });
    expect(imageReaderMocks.prepareAnnotationImages).toHaveBeenCalledWith(request.imagePath, request.quads);
  });

  it('rejects an invalid image preparation path without decoding it', async () => {
    fileOperationMocks.resolveJsonImagePath.mockReturnValue('');

    await expect(handlePrepareImage(null, { requestId: 54, imagePath: '' })).resolves.toEqual({
      success: false,
      requestId: 54,
      error: '图片路径无效。',
      path: '',
      errorKind: 'invalid-request',
    });
    expect(imageReaderMocks.prepareImageFile).not.toHaveBeenCalled();
  });

  it('resolves every requested JSON image path and rejects malformed input', () => {
    fileOperationMocks.resolveJsonImagePath.mockImplementation((imagePath, jsonPath) => `${jsonPath}:${imagePath}`);

    expect(
      handleResolveJsonImagePaths(null, {
        jsonFilePath: 'C:/datasets/sample.json',
        imagePaths: ['one.png', 'two.png'],
      }),
    ).toEqual({
      success: true,
      imagePaths: ['C:/datasets/sample.json:one.png', 'C:/datasets/sample.json:two.png'],
    });
    expect(handleResolveJsonImagePaths(null, { imagePaths: [] })).toEqual({
      success: false,
      error: '图片路径解析请求无效。',
      errorKind: 'invalid-request',
    });
  });

  it('normalizes successful and failed atomic-save results', async () => {
    fileOperationMocks.saveJsonFileAtomically.mockResolvedValue({ backupPath: 'sample.backup.json' });

    await expect(handleSaveJsonFile(null, { path: 'sample.json', str: '{}' })).resolves.toEqual({
      success: true,
      backupPath: 'sample.backup.json',
    });

    fileOperationMocks.saveJsonFileAtomically.mockRejectedValue(new Error('disk full'));
    await expect(handleSaveJsonFile(null, { path: 'sample.json', str: '{}' })).resolves.toEqual({
      success: false,
      error: '保存 JSON 文件失败。',
    });
  });

  it('gets and records workspace session events through structured responses', async () => {
    const session = {
      schemaVersion: 1,
      datasetPath: 'C:/datasets/A.json',
      imagePath: 'C:/images/one.png',
      imageIndex: 0,
    };
    const recordResult = { changed: true, stale: false, session };
    workspaceSessionMocks.getWorkspaceSession.mockResolvedValue(session);
    workspaceSessionMocks.recordWorkspaceDatasetTarget.mockResolvedValue(recordResult);
    workspaceSessionMocks.recordWorkspaceDatasetImage.mockResolvedValue(recordResult);

    await expect(handleGetWorkspaceSession()).resolves.toEqual({ success: true, session });
    await expect(handleRecordWorkspaceDataset(null, { datasetPath: session.datasetPath })).resolves.toEqual({
      success: true,
      ...recordResult,
    });
    await expect(handleRecordWorkspaceImage(null, session)).resolves.toEqual({ success: true, ...recordResult });
    expect(workspaceSessionMocks.recordWorkspaceDatasetTarget).toHaveBeenCalledWith(session.datasetPath);
    expect(workspaceSessionMocks.recordWorkspaceDatasetImage).toHaveBeenCalledWith(session);
  });

  it('contains workspace session storage failures at the IPC boundary', async () => {
    workspaceSessionMocks.getWorkspaceSession.mockRejectedValue(new Error('read failed'));
    workspaceSessionMocks.recordWorkspaceDatasetTarget.mockRejectedValue(new Error('write failed'));
    workspaceSessionMocks.recordWorkspaceDatasetImage.mockRejectedValue(new Error('write failed'));

    await expect(handleGetWorkspaceSession()).resolves.toEqual({
      success: false,
      session: null,
      error: '读取上次工作区记录失败。',
      errorKind: 'operation',
    });
    await expect(handleRecordWorkspaceDataset(null, { datasetPath: 'C:/data/sample.json' })).resolves.toEqual({
      success: false,
      session: null,
      error: '保存工作区图集记录失败。',
    });
    await expect(
      handleRecordWorkspaceImage(null, { datasetPath: 'C:/data/sample.json', imagePath: 'C:/one.png', imageIndex: 0 }),
    ).resolves.toEqual({
      success: false,
      session: null,
      error: '保存工作区图片记录失败。',
    });
  });

  it('registers every request-response handler on its intended channel', () => {
    registerIpcHandlers();

    expect(electronMocks.handle).toHaveBeenCalledWith('open-image-file-dialog', handleOpenImageDialog);
    expect(electronMocks.handle).toHaveBeenCalledWith('prepare-image', handlePrepareImage);
    expect(electronMocks.handle).toHaveBeenCalledWith('prepare-annotation-images', handlePrepareAnnotationImages);
    expect(electronMocks.handle).toHaveBeenCalledWith('open-json-file-dialog', handleOpenJsonDialog);
    expect(electronMocks.handle).toHaveBeenCalledWith('open-adjacent-json-file', handleOpenAdjacentJson);
    expect(electronMocks.handle).toHaveBeenCalledWith('read-json-file', handleReadJsonFile);
    expect(electronMocks.handle).toHaveBeenCalledWith('resolve-json-image-paths', handleResolveJsonImagePaths);
    expect(electronMocks.handle).toHaveBeenCalledWith('save-json-file', handleSaveJsonFile);
    expect(electronMocks.handle).toHaveBeenCalledWith('get-workspace-session', handleGetWorkspaceSession);
    expect(electronMocks.handle).toHaveBeenCalledWith('record-workspace-dataset', handleRecordWorkspaceDataset);
    expect(electronMocks.handle).toHaveBeenCalledWith('record-workspace-image', handleRecordWorkspaceImage);
    expect(electronMocks.handle).toHaveBeenCalledWith('normalize-annotation', handleNormalizeAnnotation);
    expect(electronMocks.handle).toHaveBeenCalledWith('normalize-visual-annotation', handleNormalizeVisualAnnotation);
    expect(electronMocks.handle).toHaveBeenCalledWith('load-annotations', handleLoadAnnotations);
    expect(electronMocks.handle).toHaveBeenCalledWith('generate-and-save-annotation', handleGenerateAndSaveAnnotation);
    expect(electronMocks.on).not.toHaveBeenCalled();
  });
});

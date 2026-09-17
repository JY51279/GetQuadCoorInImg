import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electronMocks = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  on: vi.fn(),
  handle: vi.fn(),
}));

const fileOperationMocks = vi.hoisted(() => ({
  getDefaultDialogDirectory: vi.fn(),
  getImageDialogDefaultDirectory: vi.fn(),
  readAdjacentJsonFile: vi.fn(),
  readJsonFile: vi.fn(),
  rememberJsonDirectory: vi.fn(),
  resolveJsonImagePath: vi.fn(),
  saveJsonFileAtomically: vi.fn(),
}));

const imageReaderMocks = vi.hoisted(() => ({
  prepareImageFile: vi.fn(),
}));

vi.mock('electron', () => ({
  dialog: { showOpenDialog: electronMocks.showOpenDialog },
  ipcMain: { on: electronMocks.on, handle: electronMocks.handle },
}));

vi.mock('../src/main/FileOperations.js', () => fileOperationMocks);
vi.mock('../src/main/ImageFileReader.js', () => ({
  IMAGE_EXTENSIONS: ['png'],
  prepareImageFile: imageReaderMocks.prepareImageFile,
}));

import {
  handleOpenAdjacentJson,
  handleOpenImageDialog,
  handleOpenJsonDialog,
  handlePrepareImage,
  handleResolveJsonImagePaths,
  handleSaveJsonFile,
  registerIpcHandlers,
} from '../src/main/IpcHandlers.js';

describe('Main-process IPC handlers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    fileOperationMocks.getDefaultDialogDirectory.mockReturnValue('C:/datasets');
    fileOperationMocks.getImageDialogDefaultDirectory.mockReturnValue('C:/images');
    fileOperationMocks.rememberJsonDirectory.mockResolvedValue(undefined);
    fileOperationMocks.resolveJsonImagePath.mockImplementation(path => path);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the request id when the JSON dialog is canceled', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
    const event = { reply: vi.fn() };

    await handleOpenJsonDialog(event, { requestId: 41 });

    expect(event.reply).toHaveBeenCalledWith('choose-json-file-response', {
      success: false,
      canceled: true,
      requestId: 41,
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
    const event = { reply: vi.fn() };

    await handleOpenJsonDialog(event, { requestId: 42 });

    expect(fileOperationMocks.rememberJsonDirectory).toHaveBeenCalledWith('C:/datasets/sample.json');
    expect(event.reply).toHaveBeenCalledWith('choose-json-file-response', {
      success: true,
      requestId: 42,
      jsonInfo,
    });
  });

  it('returns a structured response when the selected JSON file cannot be read', async () => {
    electronMocks.showOpenDialog.mockResolvedValue({
      canceled: false,
      filePaths: ['C:/datasets/broken.json'],
    });
    fileOperationMocks.readJsonFile.mockRejectedValue(new Error('read failed'));
    const event = { reply: vi.fn() };

    await handleOpenJsonDialog(event, { requestId: 43 });

    expect(event.reply).toHaveBeenCalledWith('choose-json-file-response', {
      success: false,
      requestId: 43,
      error: '读取 JSON 文件失败。',
    });
  });

  it('returns the request id when opening the JSON dialog fails', async () => {
    electronMocks.showOpenDialog.mockRejectedValue(new Error('dialog failed'));
    const event = { reply: vi.fn() };

    await handleOpenJsonDialog(event, { requestId: 44 });

    expect(event.reply).toHaveBeenCalledWith('choose-json-file-response', {
      success: false,
      requestId: 44,
      error: '打开 JSON 文件选择窗口失败。',
    });
  });

  it('returns the adjacent JSON file with the original request context', async () => {
    const jsonInfo = { path: 'C:/datasets/atlas10.json', str: '{}', fileName: 'atlas10.json' };
    fileOperationMocks.readAdjacentJsonFile.mockResolvedValue(jsonInfo);

    await expect(
      handleOpenAdjacentJson(null, {
        currentFilePath: 'C:/datasets/atlas1.json',
        direction: 'next',
        requestId: 45,
      }),
    ).resolves.toEqual({ success: true, requestId: 45, jsonInfo });
    expect(fileOperationMocks.readAdjacentJsonFile).toHaveBeenCalledWith('C:/datasets/atlas1.json', 'next');
  });

  it('preserves a user-facing adjacent-JSON error', async () => {
    fileOperationMocks.readAdjacentJsonFile.mockRejectedValue(new Error('当前目录没有其他图集。'));

    await expect(
      handleOpenAdjacentJson(null, {
        currentFilePath: 'C:/datasets/only.json',
        direction: 'next',
        requestId: 46,
      }),
    ).resolves.toEqual({
      success: false,
      requestId: 46,
      error: '当前目录没有其他图集。',
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

  it('rejects an invalid image preparation path without decoding it', async () => {
    fileOperationMocks.resolveJsonImagePath.mockReturnValue('');

    await expect(handlePrepareImage(null, { requestId: 54, imagePath: '' })).resolves.toEqual({
      success: false,
      requestId: 54,
      error: '图片路径无效。',
      path: '',
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

  it('registers every request-response handler on its intended channel', () => {
    registerIpcHandlers();

    expect(electronMocks.handle).toHaveBeenCalledWith('open-image-file-dialog', handleOpenImageDialog);
    expect(electronMocks.handle).toHaveBeenCalledWith('prepare-image', handlePrepareImage);
    expect(electronMocks.handle).toHaveBeenCalledWith('open-adjacent-json-file', handleOpenAdjacentJson);
    expect(electronMocks.handle).toHaveBeenCalledWith('resolve-json-image-paths', handleResolveJsonImagePaths);
    expect(electronMocks.handle).toHaveBeenCalledWith('save-json-file', handleSaveJsonFile);
    expect(electronMocks.on).toHaveBeenCalledWith('open-json-file-dialog', handleOpenJsonDialog);
    expect(electronMocks.on).not.toHaveBeenCalledWith('open-pic-file', expect.any(Function));
  });
});

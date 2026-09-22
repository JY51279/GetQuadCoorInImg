import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createJsonFileService } from '../src/renderer/src/services/JsonFileService.js';
import {
  createWorkspaceSessionService,
  observeWorkspaceRecord,
} from '../src/renderer/src/services/WorkspaceSessionService.js';
import { prepareDatasetLoad } from '../src/renderer/src/services/DatasetLoadService.js';
import { createDbrPicture, createJsonResponse } from './fixtures/DatasetFixtures.js';

const SESSION = { schemaVersion: 1, datasetPath: 'C:/datasets/sample.json', imagePath: '', imageIndex: null };
beforeEach(() => vi.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe('Service boundary contracts', () => {
  it('preserves the error classification from path resolution', async () => {
    const result = await prepareDatasetLoad(createJsonResponse([createDbrPicture()]), {
      resolveImagePaths: async () => ({ success: false, error: '图片路径无效。', errorKind: 'invalid-request' }),
    });
    expect(result).toMatchObject({ status: 'failed', error: '图片路径无效。', errorKind: 'invalid-request' });
  });

  it.each([null, {}, { path: ' ', str: '{}' }, { path: 'test.json', str: 42 }])(
    'does not invoke persistence for an invalid request: %j',
    async request => {
      const invoke = vi.fn();
      const service = createJsonFileService({ invoke });
      await expect(service.save(request)).resolves.toMatchObject({ success: false, errorKind: 'invalid-request' });
      expect(invoke).not.toHaveBeenCalled();
    },
  );

  it.each([
    null,
    {},
    { success: 'true', imagePaths: ['one.png'] },
    { success: true },
    { success: true, imagePaths: [] },
    { success: true, imagePaths: ['one.png', 'two.png'] },
    { success: true, imagePaths: [null] },
    { success: true, imagePaths: [' '] },
  ])('rejects malformed path resolution before a repair save: %j', async response => {
    const saveJsonFile = vi.fn();
    const result = await prepareDatasetLoad(createJsonResponse([createDbrPicture({ 'No.': '9' })]), {
      resolveImagePaths: async () => response,
      saveJsonFile,
    });
    expect(result).toMatchObject({ status: 'failed', errorKind: 'invalid-response' });
    expect(result.preparedJson).toBeUndefined();
    expect(saveJsonFile).not.toHaveBeenCalled();
  });

  it.each([
    null,
    {},
    { success: 'true', session: null },
    { success: true, session: {} },
    { success: true, session: { ...SESSION, imageIndex: '0' } },
    { success: true, session: { ...SESSION, imagePath: 'bad\0path' } },
  ])('distinguishes an invalid workspace response from an empty store: %j', async response => {
    const service = createWorkspaceSessionService({ invoke: async () => response });
    await expect(service.get()).resolves.toMatchObject({
      success: false,
      session: null,
      errorKind: 'invalid-response',
    });
  });

  it.each([{ changed: 'true', stale: false }, { changed: false }, { changed: true, stale: true }])(
    'rejects malformed workspace record flags: %j',
    async flags => {
      const service = createWorkspaceSessionService({
        invoke: async () => ({ success: true, session: SESSION, ...flags }),
      });
      await expect(service.recordDatasetTarget(SESSION.datasetPath)).resolves.toMatchObject({
        success: false,
        errorKind: 'invalid-response',
      });
    },
  );

  it('preserves a valid stale checkpoint result without treating it as an applied write', async () => {
    const service = createWorkspaceSessionService({
      invoke: async () => ({ success: true, changed: false, stale: true, session: SESSION }),
    });
    await expect(
      service.recordImage({ datasetPath: 'C:/another.json', imagePath: 'one.png', imageIndex: 0 }),
    ).resolves.toMatchObject({ success: true, changed: false, stale: true });
  });

  it('contains invalid record input and arbitrary transport rejection', async () => {
    const invoke = vi.fn().mockRejectedValue(null);
    const service = createWorkspaceSessionService({ invoke });
    await expect(service.recordImage(null)).resolves.toMatchObject({ success: false, errorKind: 'invalid-request' });
    expect(invoke).not.toHaveBeenCalled();
    await expect(service.get()).resolves.toMatchObject({ success: false, errorKind: 'transport' });
    expect(console.error).toHaveBeenCalledWith('Workspace session IPC failed:', null);
  });

  it('contains rejected or malformed background checkpoint results', async () => {
    await expect(observeWorkspaceRecord(Promise.reject(null))).resolves.toBeUndefined();
    await expect(observeWorkspaceRecord(Promise.resolve(undefined))).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledTimes(2);
  });
});

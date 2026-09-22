import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJsonFileService } from '../src/renderer/src/services/JsonFileService.js';

describe('JSON file service', () => {
  it.each([null, {}, true, { success: 'true' }, { success: 1 }, { success: true, backupPath: 42 }])(
    'rejects a malformed save acknowledgment: %j',
    async response => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const service = createJsonFileService({ invoke: async () => response });
      await expect(service.save({ path: 'sample.json', str: '{}' })).resolves.toMatchObject({
        success: false,
        errorKind: 'invalid-response',
      });
    },
  );
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves through the expected IPC channel and returns a backup path', async () => {
    const invoke = vi.fn(async () => ({ success: true, backupPath: 'C:/backups/sample.json' }));
    const service = createJsonFileService({ invoke });

    await expect(service.save({ path: 'C:/data/sample.json', str: '{}' }, { backupOriginal: true })).resolves.toEqual({
      success: true,
      backupPath: 'C:/backups/sample.json',
      error: '',
      errorKind: '',
    });
    expect(invoke).toHaveBeenCalledWith('save-json-file', {
      path: 'C:/data/sample.json',
      str: '{}',
      backupOriginal: true,
    });
  });

  it('normalizes unsuccessful and rejected IPC calls', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const unsuccessful = createJsonFileService({
      invoke: vi.fn(async () => ({ success: false, error: 'write denied' })),
    });
    await expect(unsuccessful.save({ path: 'sample.json', str: '{}' })).resolves.toEqual({
      success: false,
      error: '保存 JSON 文件失败。',
      errorKind: 'operation',
      backupPath: '',
    });

    const rejected = createJsonFileService({
      invoke: vi.fn(async () => {
        throw new Error('IPC unavailable');
      }),
    });
    await expect(rejected.save({ path: 'sample.json', str: '{}' })).resolves.toEqual({
      success: false,
      error: '保存 JSON 文件失败。',
      errorKind: 'transport',
      backupPath: '',
    });
  });
});

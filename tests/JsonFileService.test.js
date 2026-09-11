import { afterEach, describe, expect, it, vi } from 'vitest';
import { createJsonFileService } from '../src/renderer/src/services/JsonFileService.js';

describe('JSON file service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saves through the expected IPC channel and returns a backup path', async () => {
    const invoke = vi.fn(async () => ({ success: true, backupPath: 'C:/backups/sample.json' }));
    const service = createJsonFileService({ invoke });

    await expect(service.save({ path: 'C:/data/sample.json', str: '{}' }, { backupOriginal: true })).resolves.toEqual({
      success: true,
      backupPath: 'C:/backups/sample.json',
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
      error: 'write denied',
    });

    const rejected = createJsonFileService({
      invoke: vi.fn(async () => {
        throw new Error('IPC unavailable');
      }),
    });
    await expect(rejected.save({ path: 'sample.json', str: '{}' })).resolves.toEqual({
      success: false,
      error: 'IPC unavailable',
    });
  });
});

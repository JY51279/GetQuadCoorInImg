import { describe, expect, it } from 'vitest';
import {
  clearJsonHistoryStore,
  createJsonHistoryStore,
  getJsonHistoryForImage,
  getJsonHistoryImageIndexes,
  getJsonHistoryStoreStats,
  recordJsonHistory,
} from '../src/renderer/src/state/JsonHistoryStore.js';

function createEntry(id) {
  return { id, action: 'modify', itemIndex: 0, beforeItem: {}, afterItem: {} };
}

describe('JSON history store', () => {
  it('adds a timestamp without mutating the source entry', () => {
    const store = createJsonHistoryStore({ now: () => Date.UTC(2026, 8, 10, 2, 3, 4) });
    const sourceEntry = createEntry('first');

    const result = recordJsonHistory(store, 0, sourceEntry);

    expect(result.success).toBe(true);
    expect(result.historyEntry).toMatchObject({
      id: 'first',
      recordedAt: '2026-09-10T02:03:04.000Z',
    });
    expect(sourceEntry.recordedAt).toBeUndefined();
  });

  it('rejects an entry that belongs to a different image', () => {
    const store = createJsonHistoryStore();
    const result = recordJsonHistory(store, 1, { ...createEntry('first'), imageIndex: 0 });

    expect(result.success).toBe(false);
    expect(getJsonHistoryImageIndexes(store)).toEqual([]);
  });

  it('keeps only the configured number of entries for each image', () => {
    const store = createJsonHistoryStore({ perImageLimit: 2, totalLimit: 10 });
    recordJsonHistory(store, 0, createEntry('first'));
    recordJsonHistory(store, 0, createEntry('second'));
    recordJsonHistory(store, 0, createEntry('third'));

    expect(getJsonHistoryForImage(store, 0).undoStack.map(entry => entry.id)).toEqual(['second', 'third']);
    expect(getJsonHistoryStoreStats(store).entryCount).toBe(2);
  });

  it('evicts the least recently edited non-current image as one complete history group', () => {
    const store = createJsonHistoryStore({ perImageLimit: 3, totalLimit: 4 });
    recordJsonHistory(store, 0, createEntry('image-0-a'));
    recordJsonHistory(store, 0, createEntry('image-0-b'));
    recordJsonHistory(store, 1, createEntry('image-1-a'));
    recordJsonHistory(store, 1, createEntry('image-1-b'));

    const result = recordJsonHistory(store, 0, createEntry('image-0-c'));

    expect(result.evictedImageIndexes).toEqual([1]);
    expect(getJsonHistoryForImage(store, 1)).toBeNull();
    expect(getJsonHistoryForImage(store, 0).undoStack).toHaveLength(3);
    expect(getJsonHistoryStoreStats(store)).toMatchObject({ imageCount: 1, entryCount: 3 });
  });

  it('clears every image history when the dataset changes', () => {
    const store = createJsonHistoryStore();
    recordJsonHistory(store, 0, createEntry('first'));
    recordJsonHistory(store, 1, createEntry('second'));

    clearJsonHistoryStore(store);

    expect(getJsonHistoryImageIndexes(store)).toEqual([]);
    expect(getJsonHistoryStoreStats(store).entryCount).toBe(0);
  });
});

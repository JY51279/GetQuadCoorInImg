import { createUndoRedoHistory, recordHistoryEntry } from './UndoRedoHistory.js';

export const DEFAULT_JSON_HISTORY_LIMITS = Object.freeze({
  perImage: 30,
  total: 100,
});

function normalizeLimit(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

export function createJsonHistoryStore({
  perImageLimit = DEFAULT_JSON_HISTORY_LIMITS.perImage,
  totalLimit = DEFAULT_JSON_HISTORY_LIMITS.total,
  now = Date.now,
} = {}) {
  const normalizedTotalLimit = normalizeLimit(totalLimit, DEFAULT_JSON_HISTORY_LIMITS.total);
  const normalizedPerImageLimit = Math.min(
    normalizeLimit(perImageLimit, DEFAULT_JSON_HISTORY_LIMITS.perImage),
    normalizedTotalLimit,
  );
  return {
    histories: new Map(),
    perImageLimit: normalizedPerImageLimit,
    totalLimit: normalizedTotalLimit,
    now: typeof now === 'function' ? now : Date.now,
  };
}

export function getJsonHistoryForImage(store, imageIndex, { createIfMissing = false } = {}) {
  if (!store?.histories || !Number.isInteger(imageIndex) || imageIndex < 0) return null;

  let history = store.histories.get(imageIndex);
  if (!history && createIfMissing) {
    history = createUndoRedoHistory(store.perImageLimit);
    store.histories.set(imageIndex, history);
  }
  return history ?? null;
}

export function getJsonHistoryImageIndexes(store) {
  return store?.histories ? [...store.histories.keys()] : [];
}

function getHistoryEntryCount(history) {
  return history ? history.undoStack.length + history.redoStack.length : 0;
}

export function getJsonHistoryStoreStats(store) {
  const imageIndexes = getJsonHistoryImageIndexes(store);
  return {
    imageCount: imageIndexes.length,
    entryCount: imageIndexes.reduce(
      (total, imageIndex) => total + getHistoryEntryCount(store.histories.get(imageIndex)),
      0,
    ),
    perImageLimit: store?.perImageLimit ?? 0,
    totalLimit: store?.totalLimit ?? 0,
  };
}

function touchImageHistory(store, imageIndex, history) {
  store.histories.delete(imageIndex);
  store.histories.set(imageIndex, history);
}

function evictOldestInactiveImageHistories(store, protectedImageIndex) {
  const evictedImageIndexes = [];
  let entryCount = getJsonHistoryStoreStats(store).entryCount;

  while (entryCount > store.totalLimit) {
    const imageIndexToEvict = getJsonHistoryImageIndexes(store).find(imageIndex => imageIndex !== protectedImageIndex);
    if (imageIndexToEvict === undefined) break;

    entryCount -= getHistoryEntryCount(store.histories.get(imageIndexToEvict));
    store.histories.delete(imageIndexToEvict);
    evictedImageIndexes.push(imageIndexToEvict);
  }
  return evictedImageIndexes;
}

function createRecordedAt(store) {
  const date = new Date(store.now());
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

export function recordJsonHistory(store, imageIndex, historyEntry) {
  if (!historyEntry) return { success: false, error: 'A JSON history entry is required.' };
  if (Number.isInteger(historyEntry.imageIndex) && historyEntry.imageIndex !== imageIndex) {
    return { success: false, error: 'The JSON history entry does not match its image index.' };
  }

  const history = getJsonHistoryForImage(store, imageIndex, { createIfMissing: true });
  if (!history) return { success: false, error: 'Invalid JSON history image index.' };

  const recordedEntry = { ...historyEntry, recordedAt: createRecordedAt(store) };
  if (!recordHistoryEntry(history, recordedEntry)) {
    return { success: false, error: 'Failed to record the JSON history entry.' };
  }

  touchImageHistory(store, imageIndex, history);
  const evictedImageIndexes = evictOldestInactiveImageHistories(store, imageIndex);
  return { success: true, historyEntry: recordedEntry, evictedImageIndexes };
}

export function clearJsonHistoryStore(store) {
  store?.histories?.clear();
}

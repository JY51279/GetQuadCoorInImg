import { computed, reactive, unref } from 'vue';
import {
  DEFAULT_JSON_HISTORY_LIMITS,
  clearJsonHistoryStore,
  createJsonHistoryStore,
  getJsonHistoryForImage,
  getJsonHistoryImageIndexes,
  recordJsonHistory,
} from '../state/JsonHistoryStore.js';
import { getHistoryTimeline } from '../state/UndoRedoHistory.js';
import { KEYS } from '../utils/BasicFuncs.js';

function readSource(source) {
  return typeof source === 'function' ? source() : unref(source);
}

export function getJsonActionLabel(action) {
  const labels = {
    [KEYS.JSON_MODIFY]: '更新 Quad',
    [KEYS.JSON_COPY_PREVIOUS_LOCATION]: '沿用上一图坐标',
    [KEYS.JSON_TRANSLATE_QUAD]: '整体平移 Quad',
    [KEYS.JSON_ADD]: '新增 Quad',
    [KEYS.JSON_DELETE]: '删除 Quad',
  };
  return labels[action] ?? 'JSON 操作';
}

function getHistoryRowState(targetPosition, currentPosition) {
  if (targetPosition === currentPosition) return { state: 'current', stateLabel: '当前' };
  if (targetPosition < currentPosition) return { state: 'applied', stateLabel: '已应用' };
  return { state: 'future', stateLabel: '已撤销' };
}

function formatHistoryTime(recordedAt) {
  const date = new Date(recordedAt);
  if (Number.isNaN(date.getTime())) return '';
  const pad = value => String(value).padStart(2, '0');
  return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function useJsonHistory({
  canEdit = true,
  currentImageIndex = -1,
  getImageTarget = () => ({ success: false }),
  outputMessage = () => {},
  limits = DEFAULT_JSON_HISTORY_LIMITS,
  now = Date.now,
} = {}) {
  const store = reactive(
    createJsonHistoryStore({
      perImageLimit: limits.perImage,
      totalLimit: limits.total,
      now,
    }),
  );
  const historyLimits = Object.freeze({ perImage: store.perImageLimit, total: store.totalLimit });

  function getCurrentImageIndex() {
    return readSource(currentImageIndex);
  }

  function getCurrentHistory() {
    return getJsonHistoryForImage(store, getCurrentImageIndex());
  }

  function recordCurrent(historyEntry) {
    const result = recordJsonHistory(store, getCurrentImageIndex(), historyEntry);
    if (!result.success) outputMessage(result.error);
    return result.success;
  }

  function clear() {
    clearJsonHistoryStore(store);
  }

  const canUndo = computed(() => Boolean(readSource(canEdit)) && Boolean(getCurrentHistory()?.undoStack.length));
  const canRedo = computed(() => Boolean(readSource(canEdit)) && Boolean(getCurrentHistory()?.redoStack.length));
  const groups = computed(() => {
    const activeImageIndex = getCurrentImageIndex();
    const imageIndexes = new Set(getJsonHistoryImageIndexes(store));
    if (activeImageIndex >= 0) imageIndexes.add(activeImageIndex);

    return [...imageIndexes]
      .sort((leftIndex, rightIndex) => {
        if (leftIndex === activeImageIndex) return -1;
        if (rightIndex === activeImageIndex) return 1;
        return leftIndex - rightIndex;
      })
      .map(imageIndex => {
        const history = getJsonHistoryForImage(store, imageIndex);
        const { entries, currentPosition } = getHistoryTimeline(history);
        const isCurrent = imageIndex === activeImageIndex;
        const imageTarget = getImageTarget(imageIndex);
        const imagePath = imageTarget.success ? imageTarget.path : '';
        const fileName = imagePath.split('/').at(-1) || imagePath || '未知图片';
        const rows = [
          {
            key: 'initial',
            label: '历史起点',
            targetPosition: 0,
            ...getHistoryRowState(0, currentPosition),
          },
          ...entries.map((entry, index) => {
            const targetPosition = index + 1;
            return {
              key: `operation-${targetPosition}`,
              label: `${getJsonActionLabel(entry.action)} ${entry.itemIndex + 1}`,
              recordedAt: entry.recordedAt ?? '',
              timestampLabel: formatHistoryTime(entry.recordedAt),
              targetPosition,
              ...getHistoryRowState(targetPosition, currentPosition),
            };
          }),
        ].map(row => ({
          ...row,
          canJump: isCurrent && Boolean(readSource(canEdit)) && row.targetPosition !== currentPosition,
        }));

        return {
          imageIndex,
          label: `图片 ${imageIndex + 1}`,
          fileName,
          isCurrent,
          recordCount: entries.length,
          rows,
        };
      });
  });

  return {
    limits: historyLimits,
    canUndo,
    canRedo,
    groups,
    getCurrentHistory,
    recordCurrent,
    clear,
  };
}

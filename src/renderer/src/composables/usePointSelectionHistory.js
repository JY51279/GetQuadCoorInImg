import { computed, reactive, unref } from 'vue';
import {
  HISTORY_DIRECTION,
  clearUndoRedoHistory,
  commitHistoryStep,
  createUndoRedoHistory,
  peekHistoryEntry,
  recordHistoryEntry,
} from '../state/UndoRedoHistory.js';

export function clonePoints(points) {
  return points.map(point => ({ ...point }));
}

export function pointListsEqual(leftPoints, rightPoints) {
  return (
    leftPoints.length === rightPoints.length &&
    leftPoints.every((point, index) => point.x === rightPoints[index]?.x && point.y === rightPoints[index]?.y)
  );
}

export function usePointSelectionHistory({ canEdit = true, limit = 50 } = {}) {
  const selectedDots = reactive([]);
  const history = reactive(createUndoRedoHistory(limit));
  const canUndo = computed(() => Boolean(unref(canEdit)) && history.undoStack.length > 0);
  const canRedo = computed(() => Boolean(unref(canEdit)) && history.redoStack.length > 0);

  function replace(dots) {
    selectedDots.splice(0, selectedDots.length, ...clonePoints(dots));
  }

  function applyEdit(nextDots) {
    if (!Array.isArray(nextDots)) return false;

    const beforeDots = clonePoints(selectedDots);
    const afterDots = clonePoints(nextDots);
    if (pointListsEqual(beforeDots, afterDots)) return false;

    replace(afterDots);
    recordHistoryEntry(history, { beforeDots, afterDots });
    return true;
  }

  function applyHistory(direction) {
    if (!unref(canEdit)) return false;

    const historyEntry = peekHistoryEntry(history, direction);
    if (!historyEntry) return false;

    replace(direction === HISTORY_DIRECTION.UNDO ? historyEntry.beforeDots : historyEntry.afterDots);
    commitHistoryStep(history, direction, historyEntry);
    return true;
  }

  function undo() {
    return applyHistory(HISTORY_DIRECTION.UNDO);
  }

  function redo() {
    return applyHistory(HISTORY_DIRECTION.REDO);
  }

  function removePoint(index) {
    if (!unref(canEdit) || !Number.isInteger(index) || index < 0 || index >= selectedDots.length) return false;

    const nextDots = clonePoints(selectedDots);
    nextDots.splice(index, 1);
    return applyEdit(nextDots);
  }

  function clear() {
    return unref(canEdit) ? applyEdit([]) : false;
  }

  function reset() {
    replace([]);
    clearUndoRedoHistory(history);
  }

  function updateFromChild(nextDots) {
    if (!Array.isArray(nextDots)) return false;
    if (unref(canEdit)) return applyEdit(nextDots);

    replace(nextDots);
    clearUndoRedoHistory(history);
    return true;
  }

  return {
    selectedDots,
    canUndo,
    canRedo,
    applyEdit,
    updateFromChild,
    removePoint,
    undo,
    redo,
    clear,
    reset,
  };
}

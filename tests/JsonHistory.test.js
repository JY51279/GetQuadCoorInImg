import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { getJsonActionLabel, useJsonHistory } from '../src/renderer/src/composables/useJsonHistory.js';
import { HISTORY_DIRECTION, commitHistoryStep } from '../src/renderer/src/state/UndoRedoHistory.js';
import { KEYS } from '../src/renderer/src/utils/BasicFuncs.js';

function createEntry(action, itemIndex, imageIndex) {
  return { action, itemIndex, imageIndex, beforeItem: {}, afterItem: {} };
}

describe('JSON history view state', () => {
  it('reports action labels used by history rows and notifications', () => {
    expect(getJsonActionLabel(KEYS.JSON_MODIFY)).toBe('更新 Quad');
    expect(getJsonActionLabel(KEYS.JSON_ADD)).toBe('新增 Quad');
    expect(getJsonActionLabel(KEYS.JSON_DELETE)).toBe('删除 Quad');
    expect(getJsonActionLabel('unknown')).toBe('JSON 操作');
  });

  it('keeps the current image first and derives row states', () => {
    const currentImageIndex = ref(1);
    const history = useJsonHistory({
      currentImageIndex,
      getImageTarget: index => ({ success: true, path: `C:/images/${index}.png` }),
      now: () => Date.UTC(2026, 8, 10, 2, 3, 4),
    });
    history.recordCurrent(createEntry(KEYS.JSON_MODIFY, 2, 1));
    currentImageIndex.value = 0;
    history.recordCurrent(createEntry(KEYS.JSON_ADD, 0, 0));
    currentImageIndex.value = 1;

    expect(history.groups.value.map(group => group.imageIndex)).toEqual([1, 0]);
    expect(history.groups.value[0]).toMatchObject({
      label: '图片 2',
      fileName: '1.png',
      isCurrent: true,
      recordCount: 1,
    });
    expect(history.groups.value[0].rows).toMatchObject([
      { label: '历史起点', state: 'applied', canJump: true },
      { label: '更新 Quad 3', state: 'current', canJump: false },
    ]);
    expect(history.groups.value[1].rows.every(row => row.canJump === false)).toBe(true);
  });

  it('derives undo and redo availability without committing history early', () => {
    const canEdit = ref(true);
    const history = useJsonHistory({ canEdit, currentImageIndex: ref(0) });
    history.recordCurrent(createEntry(KEYS.JSON_DELETE, 0, 0));

    expect(history.canUndo.value).toBe(true);
    expect(history.canRedo.value).toBe(false);
    const currentHistory = history.getCurrentHistory();
    const entry = currentHistory.undoStack.at(-1);
    commitHistoryStep(currentHistory, HISTORY_DIRECTION.UNDO, entry);

    expect(history.canUndo.value).toBe(false);
    expect(history.canRedo.value).toBe(true);
    canEdit.value = false;
    expect(history.canRedo.value).toBe(false);
  });

  it('reports invalid records and clears all image groups', () => {
    const currentImageIndex = ref(-1);
    const outputMessage = vi.fn();
    const history = useJsonHistory({ currentImageIndex, outputMessage });

    expect(history.recordCurrent(createEntry(KEYS.JSON_ADD, 0, -1))).toBe(false);
    expect(outputMessage).toHaveBeenCalledWith('JSON 历史记录的图片序号无效。');

    currentImageIndex.value = 0;
    history.recordCurrent(createEntry(KEYS.JSON_ADD, 0, 0));
    history.clear();
    expect(history.groups.value).toEqual([expect.objectContaining({ imageIndex: 0, recordCount: 0 })]);
  });
});

import { describe, expect, it } from 'vitest';
import {
  HISTORY_DIRECTION,
  clearUndoRedoHistory,
  commitHistoryStep,
  createUndoRedoHistory,
  peekHistoryEntry,
  recordHistoryEntry,
} from '../src/renderer/src/state/UndoRedoHistory.js';

describe('undo and redo history', () => {
  it('moves entries between independent undo and redo stacks', () => {
    const history = createUndoRedoHistory();
    const entry = { value: 1 };

    expect(recordHistoryEntry(history, entry)).toBe(true);
    expect(peekHistoryEntry(history, HISTORY_DIRECTION.UNDO)).toBe(entry);
    expect(commitHistoryStep(history, HISTORY_DIRECTION.UNDO, entry)).toBe(true);
    expect(peekHistoryEntry(history, HISTORY_DIRECTION.UNDO)).toBeNull();
    expect(peekHistoryEntry(history, HISTORY_DIRECTION.REDO)).toBe(entry);
    expect(commitHistoryStep(history, HISTORY_DIRECTION.REDO, entry)).toBe(true);
    expect(peekHistoryEntry(history, HISTORY_DIRECTION.UNDO)).toBe(entry);
  });

  it('clears redo entries after a new edit and respects the history limit', () => {
    const history = createUndoRedoHistory(2);
    const firstEntry = { value: 1 };
    const secondEntry = { value: 2 };
    const thirdEntry = { value: 3 };

    recordHistoryEntry(history, firstEntry);
    recordHistoryEntry(history, secondEntry);
    commitHistoryStep(history, HISTORY_DIRECTION.UNDO, secondEntry);
    recordHistoryEntry(history, thirdEntry);

    expect(history.undoStack).toEqual([firstEntry, thirdEntry]);
    expect(history.redoStack).toEqual([]);

    clearUndoRedoHistory(history);
    expect(history.undoStack).toEqual([]);
    expect(history.redoStack).toEqual([]);
  });

  it('does not move a stack when the expected entry is stale', () => {
    const history = createUndoRedoHistory();
    const entry = { value: 1 };
    recordHistoryEntry(history, entry);

    expect(commitHistoryStep(history, HISTORY_DIRECTION.UNDO, { value: 1 })).toBe(false);
    expect(history.undoStack).toEqual([entry]);
    expect(history.redoStack).toEqual([]);
  });
});

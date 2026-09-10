import { describe, expect, it } from 'vitest';
import {
  HISTORY_DIRECTION,
  clearUndoRedoHistory,
  commitHistoryEntries,
  commitHistoryStep,
  createUndoRedoHistory,
  getHistoryTimeline,
  getHistoryTransition,
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

  it('builds a chronological timeline and commits a multi-step jump atomically', () => {
    const history = createUndoRedoHistory();
    const entries = [{ value: 1 }, { value: 2 }, { value: 3 }];
    entries.forEach(entry => recordHistoryEntry(history, entry));

    const backward = getHistoryTransition(history, 1);
    expect(backward).toMatchObject({
      success: true,
      direction: HISTORY_DIRECTION.UNDO,
      entries: [entries[2], entries[1]],
      currentPosition: 3,
      targetPosition: 1,
    });
    expect(commitHistoryEntries(history, backward.direction, backward.entries)).toBe(true);
    expect(getHistoryTimeline(history)).toEqual({ entries, currentPosition: 1 });

    const forward = getHistoryTransition(history, 3);
    expect(forward).toMatchObject({
      success: true,
      direction: HISTORY_DIRECTION.REDO,
      entries: [entries[1], entries[2]],
    });
    expect(commitHistoryEntries(history, forward.direction, forward.entries)).toBe(true);
    expect(getHistoryTimeline(history)).toEqual({ entries, currentPosition: 3 });
  });

  it('rejects invalid jump positions without changing either stack', () => {
    const history = createUndoRedoHistory();
    const entry = { value: 1 };
    recordHistoryEntry(history, entry);

    expect(getHistoryTransition(history, -1).success).toBe(false);
    expect(getHistoryTransition(history, 2).success).toBe(false);
    expect(commitHistoryEntries(history, HISTORY_DIRECTION.UNDO, [{ value: 1 }])).toBe(false);
    expect(getHistoryTimeline(history)).toEqual({ entries: [entry], currentPosition: 1 });
  });
});

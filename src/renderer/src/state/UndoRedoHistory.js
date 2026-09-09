export const HISTORY_DIRECTION = Object.freeze({
  UNDO: 'undo',
  REDO: 'redo',
});

export function createUndoRedoHistory(limit = 30) {
  const normalizedLimit = Number.isInteger(limit) && limit > 0 ? limit : 30;
  return {
    limit: normalizedLimit,
    undoStack: [],
    redoStack: [],
  };
}

function trimStack(stack, limit) {
  if (stack.length > limit) stack.splice(0, stack.length - limit);
}

export function recordHistoryEntry(history, entry) {
  if (!history || entry === null || entry === undefined) return false;

  history.undoStack.push(entry);
  trimStack(history.undoStack, history.limit);
  history.redoStack.splice(0, history.redoStack.length);
  return true;
}

function getHistoryStacks(history, direction) {
  if (!history) return null;
  if (direction === HISTORY_DIRECTION.UNDO) {
    return { source: history.undoStack, target: history.redoStack };
  }
  if (direction === HISTORY_DIRECTION.REDO) {
    return { source: history.redoStack, target: history.undoStack };
  }
  return null;
}

export function peekHistoryEntry(history, direction) {
  const stacks = getHistoryStacks(history, direction);
  return stacks?.source.at(-1) ?? null;
}

export function commitHistoryStep(history, direction, expectedEntry = null) {
  const stacks = getHistoryStacks(history, direction);
  if (!stacks || stacks.source.length === 0) return false;

  const entry = stacks.source.at(-1);
  if (expectedEntry !== null && entry !== expectedEntry) return false;

  stacks.source.pop();
  stacks.target.push(entry);
  trimStack(stacks.target, history.limit);
  return true;
}

export function clearUndoRedoHistory(history) {
  if (!history) return;
  history.undoStack.splice(0, history.undoStack.length);
  history.redoStack.splice(0, history.redoStack.length);
}

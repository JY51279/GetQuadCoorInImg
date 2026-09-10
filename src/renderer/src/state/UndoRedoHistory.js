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

export function getHistoryTimeline(history) {
  if (!history) return { entries: [], currentPosition: 0 };
  return {
    entries: [...history.undoStack, ...history.redoStack.toReversed()],
    currentPosition: history.undoStack.length,
  };
}

export function getHistoryTransition(history, targetPosition) {
  const { entries, currentPosition } = getHistoryTimeline(history);
  if (!Number.isInteger(targetPosition) || targetPosition < 0 || targetPosition > entries.length) {
    return { success: false, error: 'Invalid history target position.' };
  }

  if (targetPosition === currentPosition) {
    return { success: true, direction: null, entries: [], currentPosition, targetPosition };
  }

  const direction = targetPosition < currentPosition ? HISTORY_DIRECTION.UNDO : HISTORY_DIRECTION.REDO;
  const transitionEntries =
    direction === HISTORY_DIRECTION.UNDO
      ? history.undoStack.slice(targetPosition).toReversed()
      : history.redoStack.slice(-(targetPosition - currentPosition)).toReversed();
  return {
    success: true,
    direction,
    entries: transitionEntries,
    currentPosition,
    targetPosition,
  };
}

export function commitHistoryEntries(history, direction, expectedEntries) {
  const stacks = getHistoryStacks(history, direction);
  if (!stacks || !Array.isArray(expectedEntries) || expectedEntries.length === 0) return false;

  const sourceEntries = stacks.source.slice(-expectedEntries.length).toReversed();
  if (
    sourceEntries.length !== expectedEntries.length ||
    sourceEntries.some((entry, index) => entry !== expectedEntries[index])
  ) {
    return false;
  }

  for (const entry of expectedEntries) {
    stacks.source.pop();
    stacks.target.push(entry);
  }
  trimStack(stacks.target, history.limit);
  return true;
}

export function commitHistoryStep(history, direction, expectedEntry = null) {
  const entry = expectedEntry ?? peekHistoryEntry(history, direction);
  return entry === null ? false : commitHistoryEntries(history, direction, [entry]);
}

export function clearUndoRedoHistory(history) {
  if (!history) return;
  history.undoStack.splice(0, history.undoStack.length);
  history.redoStack.splice(0, history.redoStack.length);
}

const EDITABLE_TAG_NAMES = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditableTarget(target) {
  const tagName = typeof target?.tagName === 'string' ? target.tagName.toUpperCase() : '';
  return Boolean(target?.isContentEditable || EDITABLE_TAG_NAMES.has(tagName));
}

function normalizeKey(key) {
  return typeof key === 'string' && key.length === 1 ? key.toLowerCase() : key;
}

export function resolveShortcutAction(event, shortcutActions) {
  if (!event || !shortcutActions || event.altKey || event.metaKey) return null;

  const action = shortcutActions[normalizeKey(event.key)];
  if (!action) return null;
  if (event.ctrlKey && event.shiftKey) return action.ctrlShift ?? null;
  if (event.ctrlKey) return action.ctrl ?? null;
  if (event.shiftKey) return null;
  return action.default ?? null;
}

export function handleShortcutKeyDown(event, shortcutActions) {
  if (isEditableTarget(event?.target)) return false;

  const action = resolveShortcutAction(event, shortcutActions);
  if (typeof action !== 'function') return false;

  event.preventDefault();
  if (!event.repeat) action();
  return true;
}

export function getAdjacentListSelectionIndex(currentIndex, itemCount, direction) {
  if (!Number.isInteger(itemCount) || itemCount <= 0) return -1;
  if (!Number.isInteger(currentIndex) || currentIndex < 0 || currentIndex >= itemCount) return 0;
  if (direction === 'next') return Math.min(currentIndex + 1, itemCount - 1);
  if (direction === 'previous') return Math.max(currentIndex - 1, 0);
  return currentIndex;
}

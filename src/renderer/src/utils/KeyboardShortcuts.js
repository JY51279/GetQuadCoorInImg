const EDITABLE_TAG_NAMES = new Set(['INPUT', 'TEXTAREA', 'SELECT']);
const SHORTCUT_KEY_LABELS = Object.freeze({
  ArrowLeft: '←',
  ArrowRight: '→',
  ArrowUp: '↑',
  ArrowDown: '↓',
});

function isEditableTarget(target) {
  const tagName = typeof target?.tagName === 'string' ? target.tagName.toUpperCase() : '';
  return Boolean(target?.isContentEditable || EDITABLE_TAG_NAMES.has(tagName));
}

function normalizeKey(key) {
  return typeof key === 'string' && key.length === 1 ? key.toLowerCase() : key;
}

export function matchesShortcut(event, shortcut) {
  if (!event || !shortcut || normalizeKey(event.key) !== normalizeKey(shortcut.key)) return false;
  return (
    Boolean(event.ctrlKey) === Boolean(shortcut.ctrl) &&
    Boolean(event.shiftKey) === Boolean(shortcut.shift) &&
    Boolean(event.altKey) === Boolean(shortcut.alt) &&
    Boolean(event.metaKey) === Boolean(shortcut.meta)
  );
}

export function dispatchShortcut(event, commands, context = null) {
  if (!event || event.defaultPrevented || !Array.isArray(commands)) return false;

  const editableTarget = isEditableTarget(event.target);
  for (const command of commands) {
    if (typeof command?.run !== 'function' || !Array.isArray(command.shortcuts)) continue;
    const shortcut = command.shortcuts.find(candidate => matchesShortcut(event, candidate));
    if (!shortcut || (editableTarget && !command.allowInEditable)) continue;

    const invocation = { command, context, event, shortcut };
    if (typeof command.when === 'function' && !command.when(invocation)) continue;

    event.preventDefault();
    if (!event.repeat || command.allowRepeat) command.run(invocation);
    return true;
  }
  return false;
}

export function formatShortcut(shortcut) {
  if (!shortcut || typeof shortcut.key !== 'string' || shortcut.key === '') return [];

  const keys = [];
  if (shortcut.ctrl) keys.push('Ctrl');
  if (shortcut.shift) keys.push('Shift');
  if (shortcut.alt) keys.push('Alt');
  if (shortcut.meta) keys.push('Meta');

  const keyLabel = SHORTCUT_KEY_LABELS[shortcut.key] ?? shortcut.key;
  keys.push(keyLabel.length === 1 ? keyLabel.toUpperCase() : keyLabel);
  return keys;
}

export function createShortcutHelpGroups(commands, groups) {
  if (!Array.isArray(commands) || !Array.isArray(groups)) return [];

  return groups
    .map(group => ({
      title: group.title,
      items: commands
        .filter(command => command.group === group.id && command.showInHelp !== false)
        .map(command => ({
          label: command.label,
          shortcuts: (Array.isArray(command.shortcuts) ? command.shortcuts : [])
            .filter(shortcut => shortcut.showInHelp !== false)
            .map(formatShortcut)
            .filter(keys => keys.length > 0),
        }))
        .filter(item => item.label && item.shortcuts.length > 0),
    }))
    .filter(group => group.title && group.items.length > 0);
}

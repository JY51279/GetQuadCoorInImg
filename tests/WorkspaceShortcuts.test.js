import { describe, expect, it, vi } from 'vitest';
import {
  WORKSPACE_SHORTCUT_DEFINITIONS,
  WORKSPACE_SHORTCUT_HELP_GROUPS,
  createWorkspaceShortcutCommands,
} from '../src/renderer/src/shortcuts/WorkspaceShortcuts.js';
import { createShortcutHelpGroups, dispatchShortcut } from '../src/renderer/src/utils/KeyboardShortcuts.js';

function createActions() {
  return Object.fromEntries(WORKSPACE_SHORTCUT_DEFINITIONS.map(command => [command.id, vi.fn()]));
}

function createKeyEvent(overrides = {}) {
  return {
    key: 'd',
    target: { tagName: 'DIV' },
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    repeat: false,
    defaultPrevented: false,
    preventDefault: vi.fn(),
    ...overrides,
  };
}

describe('workspace shortcut configuration', () => {
  it('binds every definition to its injected action', () => {
    const actions = createActions();
    const commands = createWorkspaceShortcutCommands(actions);

    expect(commands).toHaveLength(WORKSPACE_SHORTCUT_DEFINITIONS.length);
    expect(dispatchShortcut(createKeyEvent(), commands)).toBe(true);
    expect(actions['image.next']).toHaveBeenCalledOnce();

    expect(dispatchShortcut(createKeyEvent({ shiftKey: true }), commands)).toBe(true);
    expect(actions['dataset.next']).toHaveBeenCalledOnce();
    expect(actions['image.next']).toHaveBeenCalledOnce();
  });

  it('fails fast when a command action is missing', () => {
    const actions = createActions();
    delete actions['image.next'];

    expect(() => createWorkspaceShortcutCommands(actions)).toThrow('Missing shortcut actions: image.next');
  });

  it('keeps contextual help closing separate from generated help content', () => {
    const actions = createActions();
    const commands = createWorkspaceShortcutCommands(actions);
    const inactiveEscape = createKeyEvent({ key: 'Escape' });
    const activeEscape = createKeyEvent({ key: 'Escape' });
    const helpGroups = createShortcutHelpGroups(commands, WORKSPACE_SHORTCUT_HELP_GROUPS);

    expect(dispatchShortcut(inactiveEscape, commands, { isHelpOpen: false })).toBe(false);
    expect(dispatchShortcut(activeEscape, commands, { isHelpOpen: true })).toBe(true);
    expect(actions['help.close']).toHaveBeenCalledOnce();
    expect(helpGroups.flatMap(group => group.items).some(item => item.label === '关闭帮助')).toBe(false);
    expect(helpGroups.flatMap(group => group.items).some(item => item.label === '下一张图片')).toBe(true);
    expect(helpGroups.flatMap(group => group.items).find(item => item.label === '下一图集')).toEqual({
      label: '下一图集',
      shortcuts: [
        ['Shift', 'D'],
        ['Shift', '→'],
      ],
    });
  });
});

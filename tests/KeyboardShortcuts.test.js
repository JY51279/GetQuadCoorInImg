import { describe, expect, it, vi } from 'vitest';
import {
  createShortcutHelpGroups,
  dispatchShortcut,
  formatShortcut,
  formatShortcutList,
  matchesShortcut,
} from '../src/renderer/src/utils/KeyboardShortcuts.js';

function createKeyEvent(overrides = {}) {
  return {
    key: 'w',
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

describe('keyboard shortcuts', () => {
  it('normalizes letter keys while requiring an exact modifier match', () => {
    expect(matchesShortcut(createKeyEvent({ key: 'W' }), { key: 'w' })).toBe(true);
    expect(matchesShortcut(createKeyEvent({ key: 'q', ctrlKey: true }), { key: 'q', ctrl: true })).toBe(true);
    expect(
      matchesShortcut(createKeyEvent({ key: 'Q', ctrlKey: true, shiftKey: true }), {
        key: 'q',
        ctrl: true,
        shift: true,
      }),
    ).toBe(true);
    expect(matchesShortcut(createKeyEvent({ ctrlKey: true }), { key: 'w' })).toBe(false);
    expect(matchesShortcut(createKeyEvent({ shiftKey: true }), { key: 'w' })).toBe(false);
    expect(matchesShortcut(createKeyEvent({ altKey: true }), { key: 'w' })).toBe(false);
    expect(matchesShortcut(createKeyEvent({ metaKey: true }), { key: 'w' })).toBe(false);
  });

  it('executes a recognized shortcut once and consumes its repeat events', () => {
    const run = vi.fn();
    const commands = [{ id: 'focus.toggle', shortcuts: [{ key: 'f' }], run }];
    const initialEvent = createKeyEvent({ key: 'f' });
    const repeatedEvent = createKeyEvent({ key: 'f', repeat: true });

    expect(dispatchShortcut(initialEvent, commands)).toBe(true);
    expect(dispatchShortcut(repeatedEvent, commands)).toBe(true);
    expect(run).toHaveBeenCalledTimes(1);
    expect(initialEvent.preventDefault).toHaveBeenCalledOnce();
    expect(repeatedEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it('maps aliases to one command and keeps modifier variants separate', () => {
    const previousImage = vi.fn();
    const copyPreviousLocation = vi.fn();
    const applyLocationForward = vi.fn();
    const commands = [
      {
        id: 'image.previous',
        shortcuts: [{ key: 'a' }, { key: 'ArrowLeft' }],
        run: previousImage,
      },
      {
        id: 'location.copy-previous',
        shortcuts: [{ key: 'e', ctrl: true }],
        run: copyPreviousLocation,
      },
      {
        id: 'location.apply-forward',
        shortcuts: [{ key: 'e', ctrl: true, shift: true }],
        run: applyLocationForward,
      },
    ];
    const copyEvent = createKeyEvent({ key: 'E', ctrlKey: true });
    const applyEvent = createKeyEvent({ key: 'E', ctrlKey: true, shiftKey: true });

    expect(dispatchShortcut(createKeyEvent({ key: 'a' }), commands)).toBe(true);
    expect(dispatchShortcut(createKeyEvent({ key: 'ArrowLeft' }), commands)).toBe(true);
    expect(dispatchShortcut(copyEvent, commands)).toBe(true);
    expect(dispatchShortcut(applyEvent, commands)).toBe(true);
    expect(previousImage).toHaveBeenCalledTimes(2);
    expect(copyPreviousLocation).toHaveBeenCalledOnce();
    expect(applyLocationForward).toHaveBeenCalledOnce();
    expect(copyEvent.preventDefault).toHaveBeenCalledOnce();
    expect(applyEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it('leaves editable targets and unsupported shortcuts untouched', () => {
    const run = vi.fn();
    const commands = [{ id: 'quad.previous', shortcuts: [{ key: 'w' }], run }];
    const inputEvent = createKeyEvent({ target: { tagName: 'input' } });
    const unsupportedEvent = createKeyEvent({ key: 'x' });

    expect(dispatchShortcut(inputEvent, commands)).toBe(false);
    expect(dispatchShortcut(unsupportedEvent, commands)).toBe(false);
    expect(run).not.toHaveBeenCalled();
    expect(inputEvent.preventDefault).not.toHaveBeenCalled();
    expect(unsupportedEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('uses command conditions while ignoring events already consumed by a higher-priority interaction', () => {
    const closeHelp = vi.fn();
    const consumedEscape = createKeyEvent({ key: 'Escape', defaultPrevented: true });
    const inactiveEscape = createKeyEvent({ key: 'Escape' });
    const closeEscape = createKeyEvent({ key: 'Escape' });
    const commands = [
      {
        id: 'help.close',
        shortcuts: [{ key: 'Escape' }],
        allowInEditable: true,
        when: ({ context }) => context.helpOpen,
        run: closeHelp,
      },
    ];

    expect(dispatchShortcut(consumedEscape, commands, { helpOpen: true })).toBe(false);
    expect(closeHelp).not.toHaveBeenCalled();
    expect(consumedEscape.preventDefault).not.toHaveBeenCalled();

    expect(dispatchShortcut(inactiveEscape, commands, { helpOpen: false })).toBe(false);
    expect(inactiveEscape.preventDefault).not.toHaveBeenCalled();

    expect(
      dispatchShortcut(closeEscape, commands, {
        helpOpen: true,
      }),
    ).toBe(true);
    expect(closeHelp).toHaveBeenCalledOnce();
    expect(closeEscape.preventDefault).toHaveBeenCalledOnce();
  });

  it('supports commands that remain available while an editor has focus', () => {
    const toggleHelp = vi.fn();
    const event = createKeyEvent({ key: 'F1', target: { tagName: 'textarea' } });
    const commands = [
      {
        id: 'help.toggle',
        shortcuts: [{ key: 'F1' }],
        allowInEditable: true,
        run: toggleHelp,
      },
    ];

    expect(dispatchShortcut(event, commands)).toBe(true);
    expect(toggleHelp).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it('generates help groups from the same command definitions used for dispatch', () => {
    const commands = [
      {
        id: 'image.previous',
        group: 'navigation',
        label: '上一张图片',
        shortcuts: [{ key: 'a' }, { key: 'ArrowLeft' }],
        run: vi.fn(),
      },
      {
        id: 'json.undo',
        group: 'annotation',
        label: '撤销 JSON 操作',
        shortcuts: [{ key: 'z', ctrl: true, shift: true }],
        run: vi.fn(),
      },
      {
        id: 'help.close',
        group: 'navigation',
        label: '关闭帮助',
        shortcuts: [{ key: 'Escape' }],
        showInHelp: false,
        run: vi.fn(),
      },
    ];
    const groups = [
      { id: 'navigation', title: '导航与定位' },
      { id: 'annotation', title: '标注编辑' },
    ];

    expect(createShortcutHelpGroups(commands, groups)).toEqual([
      {
        title: '导航与定位',
        items: [{ label: '上一张图片', shortcuts: [['A'], ['←']] }],
      },
      {
        title: '标注编辑',
        items: [{ label: '撤销 JSON 操作', shortcuts: [['Ctrl', 'Shift', 'Z']] }],
      },
    ]);
    expect(formatShortcut({ key: 'ArrowUp', alt: true, meta: true })).toEqual(['Alt', 'Meta', '↑']);
    expect(
      formatShortcutList([
        { key: 'd', shift: true },
        { key: 'ArrowRight', shift: true },
      ]),
    ).toBe('Shift+D / Shift+→');
  });
});

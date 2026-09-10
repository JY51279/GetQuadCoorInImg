import { describe, expect, it, vi } from 'vitest';
import {
  getAdjacentListSelectionIndex,
  handleShortcutKeyDown,
  resolveShortcutAction,
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
    preventDefault: vi.fn(),
    ...overrides,
  };
}

describe('keyboard shortcuts', () => {
  it('normalizes letter keys while requiring an exact modifier match', () => {
    const actions = {
      w: { default: vi.fn() },
      q: { default: vi.fn(), ctrl: vi.fn(), ctrlShift: vi.fn() },
    };

    expect(resolveShortcutAction(createKeyEvent({ key: 'W' }), actions)).toBe(actions.w.default);
    expect(resolveShortcutAction(createKeyEvent({ key: 'q', ctrlKey: true }), actions)).toBe(actions.q.ctrl);
    expect(resolveShortcutAction(createKeyEvent({ key: 'Q', ctrlKey: true, shiftKey: true }), actions)).toBe(
      actions.q.ctrlShift,
    );
    expect(resolveShortcutAction(createKeyEvent({ ctrlKey: true }), actions)).toBeNull();
    expect(resolveShortcutAction(createKeyEvent({ shiftKey: true }), actions)).toBeNull();
    expect(resolveShortcutAction(createKeyEvent({ altKey: true }), actions)).toBeNull();
    expect(resolveShortcutAction(createKeyEvent({ metaKey: true }), actions)).toBeNull();
  });

  it('executes a recognized shortcut once and consumes its repeat events', () => {
    const action = vi.fn();
    const actions = { f: { default: action } };
    const initialEvent = createKeyEvent({ key: 'f' });
    const repeatedEvent = createKeyEvent({ key: 'f', repeat: true });

    expect(handleShortcutKeyDown(initialEvent, actions)).toBe(true);
    expect(handleShortcutKeyDown(repeatedEvent, actions)).toBe(true);
    expect(action).toHaveBeenCalledTimes(1);
    expect(initialEvent.preventDefault).toHaveBeenCalledOnce();
    expect(repeatedEvent.preventDefault).toHaveBeenCalledOnce();
  });

  it('leaves editable targets and unsupported shortcuts untouched', () => {
    const action = vi.fn();
    const actions = { w: { default: action } };
    const inputEvent = createKeyEvent({ target: { tagName: 'input' } });
    const unsupportedEvent = createKeyEvent({ key: 'x' });

    expect(handleShortcutKeyDown(inputEvent, actions)).toBe(false);
    expect(handleShortcutKeyDown(unsupportedEvent, actions)).toBe(false);
    expect(action).not.toHaveBeenCalled();
    expect(inputEvent.preventDefault).not.toHaveBeenCalled();
    expect(unsupportedEvent.preventDefault).not.toHaveBeenCalled();
  });

  it('selects the first list item from an empty selection and clamps navigation at both ends', () => {
    expect(getAdjacentListSelectionIndex(-1, 3, 'previous')).toBe(0);
    expect(getAdjacentListSelectionIndex(-1, 3, 'next')).toBe(0);
    expect(getAdjacentListSelectionIndex(0, 3, 'previous')).toBe(0);
    expect(getAdjacentListSelectionIndex(1, 3, 'previous')).toBe(0);
    expect(getAdjacentListSelectionIndex(1, 3, 'next')).toBe(2);
    expect(getAdjacentListSelectionIndex(2, 3, 'next')).toBe(2);
    expect(getAdjacentListSelectionIndex(-1, 0, 'next')).toBe(-1);
  });
});

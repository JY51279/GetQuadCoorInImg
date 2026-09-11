import { ref } from 'vue';
import { describe, expect, it } from 'vitest';
import { usePointSelectionHistory } from '../src/renderer/src/composables/usePointSelectionHistory.js';

describe('Point selection history', () => {
  it('replaces child state without history while editing is disabled', () => {
    const canEdit = ref(false);
    const selection = usePointSelectionHistory({ canEdit });
    const sourceDots = [{ x: 1, y: 2 }];

    expect(selection.updateFromChild(sourceDots)).toBe(true);
    sourceDots[0].x = 99;

    expect([...selection.selectedDots]).toEqual([{ x: 1, y: 2 }]);
    expect(selection.canUndo.value).toBe(false);
    expect(selection.undo()).toBe(false);
  });

  it('records editable changes and supports undo and redo', () => {
    const canEdit = ref(true);
    const selection = usePointSelectionHistory({ canEdit });

    selection.updateFromChild([{ x: 1, y: 2 }]);
    selection.updateFromChild([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);

    expect(selection.canUndo.value).toBe(true);
    expect(selection.undo()).toBe(true);
    expect([...selection.selectedDots]).toEqual([{ x: 1, y: 2 }]);
    expect(selection.canRedo.value).toBe(true);
    expect(selection.redo()).toBe(true);
    expect([...selection.selectedDots]).toEqual([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);
  });

  it('removes and clears points only when editing is enabled', () => {
    const canEdit = ref(true);
    const selection = usePointSelectionHistory({ canEdit });
    selection.updateFromChild([
      { x: 1, y: 2 },
      { x: 3, y: 4 },
    ]);

    expect(selection.removePoint(0)).toBe(true);
    expect([...selection.selectedDots]).toEqual([{ x: 3, y: 4 }]);
    expect(selection.clear()).toBe(true);
    expect([...selection.selectedDots]).toEqual([]);

    canEdit.value = false;
    expect(selection.removePoint(0)).toBe(false);
    expect(selection.clear()).toBe(false);
  });

  it('resets points and both history stacks for a new image', () => {
    const selection = usePointSelectionHistory();
    selection.updateFromChild([{ x: 1, y: 2 }]);
    selection.undo();
    expect(selection.canRedo.value).toBe(true);

    selection.reset();

    expect([...selection.selectedDots]).toEqual([]);
    expect(selection.canUndo.value).toBe(false);
    expect(selection.canRedo.value).toBe(false);
  });
});

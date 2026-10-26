import { nextTick, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceQuadSelection } from '../src/renderer/src/composables/useWorkspaceQuadSelection.js';
import { WORKFLOW_PHASE, createWorkflowState } from '../src/renderer/src/state/WorkflowState.js';

function createSelection() {
  const workflowState = ref(
    createWorkflowState({
      phase: WORKFLOW_PHASE.READY,
      datasetTarget: { path: 'C:/data/sample.json', fileName: 'sample.json' },
    }),
  );
  const quadTotal = ref(3);
  const canOperate = ref(true);
  const canInteract = ref(true);
  const focusQuad = vi.fn(() => ({ success: true }));
  const cancelTranslation = vi.fn();
  const outputMessage = vi.fn();
  const selection = useWorkspaceQuadSelection({
    workflowState,
    quadTotal,
    canOperate: () => canOperate.value,
    canInteract: () => canInteract.value,
    focusQuad,
    cancelTranslation,
    outputMessage,
  });
  return {
    selection,
    workflowState,
    quadTotal,
    canOperate,
    canInteract,
    focusQuad,
    cancelTranslation,
    outputMessage,
  };
}

describe('Workspace Quad selection', () => {
  it('normalizes selection and blocks changes outside the ready workflow phase', () => {
    const { selection, workflowState } = createSelection();

    expect(selection.select(1)).toBe(true);
    expect(selection.activeQuadIndex.value).toBe(1);
    expect(selection.activeLabel.value).toBe('2 / 3');
    expect(selection.select(99)).toBe(true);
    expect(selection.activeQuadIndex.value).toBe(-1);

    workflowState.value.phase = WORKFLOW_PHASE.DATASET_READY;
    expect(selection.select(0)).toBe(false);
    expect(selection.activeQuadIndex.value).toBe(-1);
  });

  it('locks selection to the translating Quad and cancels invalid starts or resets', () => {
    const { selection, canOperate, cancelTranslation } = createSelection();
    selection.select(1);

    expect(selection.lockForTranslation({ quadIndex: 1 })).toBe(true);
    expect(selection.isSelectionLocked.value).toBe(true);
    expect(selection.select(2)).toBe(false);
    expect(selection.activeQuadIndex.value).toBe(1);
    expect(selection.unlockForTranslation({ quadIndex: 0 })).toBe(false);
    expect(selection.unlockForTranslation({ quadIndex: 1 })).toBe(true);

    canOperate.value = false;
    expect(selection.lockForTranslation({ quadIndex: 1 })).toBe(false);
    expect(cancelTranslation).toHaveBeenCalledWith('selection-mismatch');

    canOperate.value = true;
    selection.lockForTranslation({ quadIndex: 1 });
    selection.reset();
    expect(cancelTranslation).toHaveBeenCalledWith('selection-reset');
    expect(selection.activeQuadIndex.value).toBe(-1);
  });

  it('navigates adjacent Quads only while editing is available', () => {
    const { selection, canOperate } = createSelection();

    expect(selection.selectAdjacent('next')).toBe(true);
    expect(selection.activeQuadIndex.value).toBe(0);
    expect(selection.selectAdjacent('previous')).toBe(true);
    expect(selection.activeQuadIndex.value).toBe(-1);

    canOperate.value = false;
    expect(selection.selectAdjacent('next')).toBe(false);
    expect(selection.activeQuadIndex.value).toBe(-1);
  });

  it('coordinates focus mode, scheduled focus, and dataset reset', async () => {
    const { selection, focusQuad, outputMessage } = createSelection();
    selection.select(2);

    expect(selection.toggleFocusMode()).toBe(true);
    await nextTick();
    expect(selection.isFocusModeEnabled.value).toBe(true);
    expect(focusQuad).toHaveBeenCalledWith(2);
    expect(outputMessage).toHaveBeenCalledWith('已进入 Quad 聚焦模式。');

    selection.selectAdjacent('previous');
    await nextTick();
    expect(focusQuad).toHaveBeenLastCalledWith(1);

    selection.resetForDatasetChange();
    expect(selection.isFocusModeEnabled.value).toBe(false);
  });

  it('rejects focus mode without an image and ignores scheduled work after disposal', async () => {
    const { selection, canInteract, focusQuad, outputMessage } = createSelection();
    canInteract.value = false;
    expect(selection.toggleFocusMode()).toBe(false);
    expect(outputMessage).toHaveBeenCalledWith('请先加载一张可用图片。');

    canInteract.value = true;
    selection.select(0);
    selection.toggleFocusMode();
    selection.dispose();
    await nextTick();
    expect(focusQuad).not.toHaveBeenCalled();
    expect(selection.select(1)).toBe(false);
  });
});

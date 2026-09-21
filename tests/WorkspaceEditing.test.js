import { computed, ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useWorkspaceEditing } from '../src/renderer/src/composables/useWorkspaceEditing.js';
import { canEdit } from '../src/renderer/src/state/WorkflowState.js';
import { commitPreparedJsonProcess, getJsonFileInfo, resetPicJson } from '../src/renderer/src/state/DatasetState.js';
import { prepareJsonProcess } from '../src/renderer/src/utils/DatasetPreparation.js';
import { createPicture } from './fixtures/DatasetFixtures.js';
import { createDatasetWorkflowState } from './fixtures/WorkflowFixtures.js';

function createEditor() {
  const prepared = prepareJsonProcess({
    path: 'C:/datasets/sample.json',
    str: JSON.stringify({ Picture: [createPicture('DBR', 'C:/images/one.png', '10 10 20 10 20 20 10 20')] }),
  });
  expect(commitPreparedJsonProcess(prepared)).toBe(true);
  expect(resetPicJson('C:/images/one.png', 0).success).toBe(true);
  const workflowState = ref(createDatasetWorkflowState());
  const saveJsonFile = vi.fn(async () => true);
  const view = Object.fromEntries(
    [
      'outputMessage',
      'refreshCurrentAnnotations',
      'clearCurrentAnnotations',
      'clearCurrentImage',
      'selectQuadIndex',
      'unlockQuadSelectionForTranslation',
      'resetDots',
      'closeQuadLocationPropagation',
      'onAnnotationAdded',
    ].map(name => [name, vi.fn()]),
  );
  let active = true;
  const editor = useWorkspaceEditing({
    workflowState,
    saveJsonFile,
    ...view,
    isActive: () => active,
    canOperate: computed(() => canEdit(workflowState.value)),
    activeQuadIndex: ref(0),
    quadSelectionLockIndex: ref(0),
    quadTotal: ref(1),
    imagePositionView: ref({ currentIndex: 0, total: 1 }),
    imageCoordinateScale: ref({ x: 0.4, y: 0.4 }),
    currentImageOriginalSize: ref({ width: 100, height: 100 }),
    selectedDots: ref([]),
    canApplyQuadLocationForward: ref(false),
    quadLocationPropagationCount: ref(0),
  });
  return {
    editor,
    saveJsonFile,
    view,
    dispose: () => {
      active = false;
    },
  };
}

const pointEdit = { quadIndex: 0, pointIndex: 1, imagePoint: { x: 7.6, y: 4.4 } };

describe('Workspace editing controller without a mounted page', () => {
  it('records one history entry only after persistence succeeds', async () => {
    const { editor, saveJsonFile, view } = createEditor();
    let finishSave;
    saveJsonFile.mockReturnValueOnce(
      new Promise(resolve => {
        finishSave = resolve;
      }),
    );
    const saving = editor.commitQuadPointDrag(pointEdit);
    expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(0);
    expect(view.refreshCurrentAnnotations).not.toHaveBeenCalled();
    finishSave(true);
    await saving;

    expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(1);
    expect(editor.canUndoJson.value).toBe(true);
    expect(view.refreshCurrentAnnotations).toHaveBeenCalledExactlyOnceWith({ redrawOverlay: true });
    expect(view.selectQuadIndex).toHaveBeenCalledExactlyOnceWith(0);
  });

  it('does not persist or record a no-op or invalid point', async () => {
    const { editor, saveJsonFile } = createEditor();
    const before = getJsonFileInfo();
    await editor.commitQuadPointDrag({ ...pointEdit, imagePoint: { x: 8, y: 4 } });
    await editor.commitQuadPointDrag({ ...pointEdit, imagePoint: { x: 40, y: 4 } });
    expect(getJsonFileInfo()).toEqual(before);
    expect(saveJsonFile).not.toHaveBeenCalled();
    expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(0);
  });

  it('keeps the undo cursor on save failure, then supports undo and redo without extra history', async () => {
    const { editor, saveJsonFile } = createEditor();
    const before = getJsonFileInfo();
    await editor.commitQuadPointDrag(pointEdit);
    const edited = getJsonFileInfo();
    saveJsonFile.mockResolvedValueOnce(false);
    await editor.undoJsonEdit();
    expect(getJsonFileInfo()).toEqual(edited);
    expect(editor.canUndoJson.value).toBe(true);
    expect(editor.canRedoJson.value).toBe(false);

    await editor.undoJsonEdit();
    expect(getJsonFileInfo()).toEqual(before);
    await editor.redoJsonEdit();
    expect(getJsonFileInfo()).toEqual(edited);
    expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(1);
  });

  it('jumps over multiple history entries in one save without appending history', async () => {
    const { editor, saveJsonFile } = createEditor();
    const before = getJsonFileInfo();
    await editor.commitQuadPointDrag(pointEdit);
    await editor.commitQuadPointDrag({ ...pointEdit, imagePoint: { x: 7.2, y: 4.4 } });
    await editor.jumpJsonHistory(0, 0);

    expect(saveJsonFile).toHaveBeenCalledTimes(3);
    expect(getJsonFileInfo()).toEqual(before);
    expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(2);
    expect(editor.canUndoJson.value).toBe(false);
    expect(editor.canRedoJson.value).toBe(true);
  });

  describe.each(['point', 'translation'])('disposed %s save', command => {
    it.each([true, false])('settles success=%s without calling any view effect', async success => {
      const { editor, saveJsonFile, view, dispose } = createEditor();
      const before = getJsonFileInfo();
      let finishSave;
      saveJsonFile.mockReturnValueOnce(
        new Promise(resolve => {
          finishSave = resolve;
        }),
      );
      const saving =
        command === 'point'
          ? editor.commitQuadPointDrag(pointEdit)
          : editor.commitQuadTranslation({ quadIndex: 0, target: { type: 'whole' }, imageDelta: { x: 1, y: 0 } });
      const edited = getJsonFileInfo();
      expect(edited.str).not.toBe(before.str);
      dispose();
      finishSave(success);
      await saving;

      expect(getJsonFileInfo()).toEqual(success ? edited : before);
      expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(0);
      for (const effect of Object.values(view)) expect(effect).not.toHaveBeenCalled();
    });
  });
});

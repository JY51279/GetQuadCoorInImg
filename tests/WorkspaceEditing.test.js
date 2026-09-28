import { computed, reactive, ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceEditing } from '../src/renderer/src/composables/useWorkspaceEditing.js';
import { canEdit, WORKFLOW_PHASE } from '../src/renderer/src/state/WorkflowState.js';
import {
  clearDatasetProcess,
  commitPreparedJsonProcess,
  getJsonFileInfo,
  resetPicJson,
} from '../src/renderer/src/state/DatasetState.js';
import { prepareJsonProcess } from '../src/renderer/src/utils/DatasetPreparation.js';
import { createPicture } from './fixtures/DatasetFixtures.js';
import { createDatasetWorkflowState } from './fixtures/WorkflowFixtures.js';

function createEditor({
  pictures = [createPicture('DBR', 'C:/images/one.png', '10 10 20 10 20 20 10 20')],
  currentIndex = 0,
} = {}) {
  const prepared = prepareJsonProcess({
    path: 'C:/datasets/sample.json',
    str: JSON.stringify({ Picture: pictures }),
  });
  expect(commitPreparedJsonProcess(prepared)).toBe(true);
  expect(resetPicJson(pictures[currentIndex]['Image Source'], currentIndex).success).toBe(true);
  const workflowState = ref(createDatasetWorkflowState());
  const saveJsonFile = vi.fn(async () => ({ success: true }));
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
  const inputs = {
    canOperate: computed(() => canEdit(workflowState.value)),
    activeQuadIndex: ref(0),
    quadSelectionLockIndex: ref(0),
    quadTotal: ref(1),
    imagePositionView: ref({ currentIndex, total: pictures.length }),
    imageCoordinateScale: ref({ x: 0.4, y: 0.4 }),
    currentImageOriginalSize: ref({ width: 100, height: 100 }),
    selectedDots: reactive([]),
    canApplyQuadLocationForward: ref(false),
    quadLocationPropagationCount: ref(0),
  };
  const editor = useWorkspaceEditing({
    workflowState,
    saveJsonFile,
    ...view,
    ...inputs,
    isActive: () => active,
  });
  return {
    inputs,
    workflowState,
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
  afterEach(clearDatasetProcess);

  it('restores mixed add/delete history after a failed jump, then replays it in one save', async () => {
    const { editor, saveJsonFile, inputs, view, workflowState } = createEditor();
    const before = getJsonFileInfo();
    inputs.selectedDots.push({ x: 12, y: 12 }, { x: 16, y: 12 }, { x: 16, y: 16 }, { x: 12, y: 16 });
    await editor.addJsonItem();
    await editor.deleteJsonItem();
    const edited = getJsonFileInfo();
    expect(JSON.parse(edited.str).Picture[0]['Barcode Info'][0]['Barcode Location']).toBe('30 30 40 30 40 40 30 40');
    expect(view.onAnnotationAdded).toHaveBeenCalledOnce();
    view.refreshCurrentAnnotations.mockClear();
    saveJsonFile.mockResolvedValueOnce({ success: false, error: '保存失败。' });
    await editor.jumpJsonHistory(0, 0);
    expect(getJsonFileInfo()).toEqual(edited);
    expect(editor.jsonHistoryGroups.value[0].rows.find(row => row.state === 'current').targetPosition).toBe(2);
    expect(view.refreshCurrentAnnotations).not.toHaveBeenCalled();

    await editor.jumpJsonHistory(0, 0);
    expect(getJsonFileInfo()).toEqual(before);
    expect(view.refreshCurrentAnnotations).toHaveBeenCalledExactlyOnceWith({
      resetSelection: true,
      indexMutations: [
        { type: 'insert', index: 0 },
        { type: 'delete', index: 1 },
      ],
      redrawOverlay: false,
    });
    await editor.jumpJsonHistory(0, 2);
    expect(getJsonFileInfo()).toEqual(edited);
    expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(2);
    expect(saveJsonFile).toHaveBeenCalledTimes(5);
    expect(workflowState.value).toMatchObject({ phase: WORKFLOW_PHASE.READY, operation: null });
  });

  it('does not save rejected, foreign-image or unchanged history jumps', async () => {
    const { editor, saveJsonFile } = createEditor();
    const before = getJsonFileInfo();
    await editor.undoJsonEdit();
    await editor.redoJsonEdit();
    await editor.jumpJsonHistory(0, 0);
    await editor.jumpJsonHistory(0, 99);
    await editor.jumpJsonHistory(1, 0);
    expect(getJsonFileInfo()).toEqual(before);
    expect(saveJsonFile).not.toHaveBeenCalled();
    expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(0);
  });

  it.each(['DBR', 'DDN', 'DLR'])(
    'rolls back and retries a %s batch, then undoes/redoes every changed image',
    async product => {
      const pictures = [
        createPicture(product, 'C:/images/one.png', '10 10 20 10 20 20 10 20'),
        createPicture(product, 'C:/images/two.png', '30 30 40 30 40 40 30 40'),
        createPicture(product, 'C:/images/three.png', '50 50 60 50 60 60 50 60'),
        createPicture(product, 'C:/images/four.png', '10 10 20 10 20 20 10 20'),
      ];
      const { editor, saveJsonFile, inputs, workflowState } = createEditor({ pictures });
      inputs.canApplyQuadLocationForward.value = true;
      inputs.quadLocationPropagationCount.value = 3;
      const before = getJsonFileInfo();
      saveJsonFile.mockResolvedValueOnce({ success: false, error: '保存失败。' });
      await editor.applyQuadLocationForward();
      expect(getJsonFileInfo()).toEqual(before);
      expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(0);

      await editor.applyQuadLocationForward();
      const edited = getJsonFileInfo();
      const editedPictures = JSON.parse(edited.str).Picture;
      editedPictures.forEach((picture, index) => {
        expect(picture).toEqual({
          ...editedPictures[0],
          'No.': String(index + 1),
          'Image Source': pictures[index]['Image Source'],
        });
      });
      expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(1);
      await editor.applyQuadLocationForward();
      expect(saveJsonFile).toHaveBeenCalledTimes(2);
      expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(1);
      await editor.undoJsonEdit();
      expect(getJsonFileInfo()).toEqual(before);
      await editor.redoJsonEdit();
      expect(getJsonFileInfo()).toEqual(edited);
      expect(saveJsonFile).toHaveBeenCalledTimes(4);
      expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(1);
      expect(workflowState.value).toMatchObject({ phase: WORKFLOW_PHASE.READY, operation: null });
    },
  );

  it('copies the previous-image coordinates only after a successful save and skips an identical copy', async () => {
    const { editor, saveJsonFile } = createEditor({
      currentIndex: 1,
      pictures: [
        createPicture('DBR', 'C:/images/one.png'),
        createPicture('DBR', 'C:/images/two.png', '30 30 40 30 40 40 30 40'),
      ],
    });
    const before = getJsonFileInfo();
    saveJsonFile.mockResolvedValueOnce({ success: false });
    await editor.copyPreviousQuadLocation();
    expect(getJsonFileInfo()).toEqual(before);
    expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(0);
    await editor.copyPreviousQuadLocation();
    const edited = getJsonFileInfo();
    expect(JSON.parse(edited.str).Picture[1]['Barcode Info'][0]['Barcode Location']).toBe('0 0 10 0 10 10 0 10');
    await editor.copyPreviousQuadLocation();
    expect(saveJsonFile).toHaveBeenCalledTimes(2);
    expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(1);
    await editor.undoJsonEdit();
    expect(getJsonFileInfo()).toEqual(before);
    await editor.redoJsonEdit();
    expect(getJsonFileInfo()).toEqual(edited);
  });

  it('rejects edit commands while a save is pending without changing data or recording extra history', async () => {
    const { editor, saveJsonFile, workflowState } = createEditor();
    let finishSave;
    saveJsonFile.mockReturnValueOnce(
      new Promise(resolve => {
        finishSave = resolve;
      }),
    );
    const pending = editor.commitQuadPointDrag(pointEdit);
    const edited = getJsonFileInfo();
    const operation = workflowState.value.operation;
    await editor.modifyJsonItem();
    await editor.copyPreviousQuadLocation();
    await editor.jumpJsonHistory(0, 0);
    expect(workflowState.value.operation).toBe(operation);
    expect(getJsonFileInfo()).toEqual(edited);
    expect(saveJsonFile).toHaveBeenCalledOnce();
    expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(0);
    finishSave({ success: true });
    await pending;
    expect(workflowState.value).toMatchObject({ phase: WORKFLOW_PHASE.READY, operation: null });
    expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(1);
  });

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
    finishSave({ success: true });
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
    saveJsonFile.mockResolvedValueOnce({ success: false });
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
      finishSave({ success });
      await saving;

      expect(getJsonFileInfo()).toEqual(success ? edited : before);
      expect(editor.jsonHistoryGroups.value[0].recordCount).toBe(0);
      for (const effect of Object.values(view)) expect(effect).not.toHaveBeenCalled();
    });
  });
});

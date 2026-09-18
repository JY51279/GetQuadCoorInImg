import { describe, expect, it } from 'vitest';
import {
  WORKFLOW_OPERATION,
  WORKFLOW_PHASE,
  canApplyOperationResult,
  canApplySaveResult,
  canChangeQuadSelection,
  canEdit,
  canStartOperation,
  commitDataset,
  completeOperation,
  createWorkflowState,
  failOperation,
  isCurrentOperation,
  isOperationActive,
  operationReturnsTo,
  rejectDataset,
  selectDatasetTarget,
  startDatasetLoad,
  startImageLoad,
  startSave,
} from '../src/renderer/src/state/WorkflowState.js';
import { TEST_DATASET_TARGET, createDatasetWorkflowState } from './fixtures/WorkflowFixtures.js';

describe('Workflow state', () => {
  it('moves from ready through saving and back to ready', () => {
    const initial = createDatasetWorkflowState();
    const started = startSave(initial, { sourceImageIndex: 2 });

    expect(started.success).toBe(true);
    expect(started.state.phase).toBe(WORKFLOW_PHASE.SAVING);
    expect(started.state.operation).toMatchObject({
      id: started.operationId,
      type: WORKFLOW_OPERATION.SAVE,
      returnPhase: WORKFLOW_PHASE.READY,
      sourceImageIndex: 2,
    });

    const completed = completeOperation(started.state, started.operationId);
    expect(completed.success).toBe(true);
    expect(completed.state.phase).toBe(WORKFLOW_PHASE.READY);
    expect(completed.state.operation).toBeNull();
  });

  it('rejects conflicting work while an operation is active', () => {
    const saving = startSave(createDatasetWorkflowState()).state;

    expect(startImageLoad(saving).success).toBe(false);
    expect(startDatasetLoad(saving).success).toBe(false);
    expect(startSave(saving).success).toBe(false);
  });

  it('exposes operation permissions from the same rules used by transitions', () => {
    const empty = createWorkflowState();
    const datasetReady = createDatasetWorkflowState(WORKFLOW_PHASE.DATASET_READY);
    const ready = createDatasetWorkflowState();
    const datasetError = createDatasetWorkflowState(WORKFLOW_PHASE.DATASET_ERROR);
    const saving = startSave(ready).state;

    expect(canStartOperation(empty, WORKFLOW_OPERATION.LOAD_DATASET)).toBe(true);
    expect(canStartOperation(datasetError, WORKFLOW_OPERATION.LOAD_DATASET)).toBe(true);
    expect(canStartOperation(empty, WORKFLOW_OPERATION.LOAD_IMAGE)).toBe(false);
    expect(canStartOperation(datasetReady, WORKFLOW_OPERATION.LOAD_IMAGE)).toBe(true);
    expect(canStartOperation(datasetReady, WORKFLOW_OPERATION.SAVE)).toBe(false);
    expect(canStartOperation(ready, WORKFLOW_OPERATION.SAVE)).toBe(true);
    expect(canStartOperation(saving, WORKFLOW_OPERATION.LOAD_DATASET)).toBe(false);
  });

  it('exposes editing and quad-selection capabilities', () => {
    const ready = createDatasetWorkflowState();
    const loadingImage = startImageLoad(ready).state;
    const saving = startSave(ready).state;

    expect(canEdit(ready)).toBe(true);
    expect(canEdit(loadingImage)).toBe(false);
    expect(canChangeQuadSelection(loadingImage)).toBe(false);
    expect(canChangeQuadSelection(saving)).toBe(false);
    expect(isOperationActive(loadingImage, WORKFLOW_OPERATION.LOAD_IMAGE)).toBe(true);
    expect(isOperationActive(saving, WORKFLOW_OPERATION.LOAD_IMAGE)).toBe(false);
  });

  it('does not let a stale operation complete a newer operation', () => {
    const first = startImageLoad(createDatasetWorkflowState());
    const returned = failOperation(first.state, first.operationId).state;
    const second = startImageLoad(returned);

    expect(isCurrentOperation(second.state, first.operationId)).toBe(false);
    expect(completeOperation(second.state, first.operationId).success).toBe(false);
    expect(second.state.operation.id).toBe(second.operationId);
  });

  it('invalidates the previous dataset as soon as a new target is selected', () => {
    const started = startDatasetLoad(createWorkflowState());
    const target = { path: 'C:/datasets/B.json', fileName: 'B.json' };
    const selected = selectDatasetTarget(started.state, started.operationId, target);
    const committed = commitDataset(selected.state, started.operationId);

    expect(selected.success).toBe(true);
    expect(selected.state.datasetVersion).toBe(1);
    expect(selected.state.datasetTarget).toEqual(target);
    expect(selected.state.operation.target).toEqual(target);
    expect(committed.success).toBe(true);
    expect(committed.state.phase).toBe(WORKFLOW_PHASE.DATASET_READY);
    expect(committed.state.datasetVersion).toBe(1);
  });

  it('does not commit dataset content before a target has been selected', () => {
    const started = startDatasetLoad(createWorkflowState());

    expect(commitDataset(started.state, started.operationId)).toMatchObject({
      success: false,
      error: '图集加载操作尚未选择目标。',
    });
  });

  it('keeps a rejected target as a stable dataset-error position', () => {
    const started = startDatasetLoad(createDatasetWorkflowState());
    const selected = selectDatasetTarget(started.state, started.operationId, {
      path: 'C:/datasets/B.json',
      fileName: 'B.json',
    });
    const rejected = rejectDataset(selected.state, started.operationId);

    expect(rejected.success).toBe(true);
    expect(rejected.state.phase).toBe(WORKFLOW_PHASE.DATASET_ERROR);
    expect(rejected.state.operation).toBeNull();
    expect(rejected.state.datasetTarget).toEqual({ path: 'C:/datasets/B.json', fileName: 'B.json' });
    expect(canEdit(rejected.state)).toBe(false);
    expect(canStartOperation(rejected.state, WORKFLOW_OPERATION.LOAD_DATASET)).toBe(true);
  });

  it('prevents an old operation context from applying to a new dataset version', () => {
    const saving = startSave(createDatasetWorkflowState());
    const changedDatasetState = { ...saving.state, datasetVersion: saving.state.datasetVersion + 1 };

    expect(canApplyOperationResult(changedDatasetState, saving.operationId)).toBe(false);
  });

  it('applies a save result only to its captured image', () => {
    const saving = startSave(createDatasetWorkflowState(), { sourceImageIndex: 2 });

    expect(canApplySaveResult(saving.state, saving.operationId, 2)).toBe(true);
    expect(canApplySaveResult(saving.state, saving.operationId, 3)).toBe(false);
  });

  it('returns to the captured stable phase after failure', () => {
    const datasetTarget = { path: 'C:/datasets/A.json', fileName: 'A.json' };
    const initial = createDatasetWorkflowState(WORKFLOW_PHASE.DATASET_READY, { datasetTarget });
    const started = startImageLoad(initial);

    expect(operationReturnsTo(started.state, started.operationId, WORKFLOW_PHASE.DATASET_READY)).toBe(true);
    expect(operationReturnsTo(started.state, started.operationId, WORKFLOW_PHASE.READY)).toBe(false);

    const failed = failOperation(started.state, started.operationId);

    expect(failed.success).toBe(true);
    expect(failed.state.phase).toBe(WORKFLOW_PHASE.DATASET_READY);
    expect(failed.state.datasetTarget).toEqual(datasetTarget);
  });

  it('rejects impossible initial state combinations', () => {
    expect(() => createWorkflowState({ phase: WORKFLOW_PHASE.READY })).toThrow('可编辑状态必须包含图集目标。');
    expect(() => createWorkflowState({ phase: WORKFLOW_PHASE.EMPTY, datasetTarget: TEST_DATASET_TARGET })).toThrow(
      '空工作区不能包含图集目标。',
    );
    expect(() =>
      createWorkflowState({
        phase: WORKFLOW_PHASE.DATASET_READY,
        datasetTarget: TEST_DATASET_TARGET,
        datasetVersion: 0,
      }),
    ).toThrow('包含图集目标的工作区必须具有有效图集版本。');
  });

  it('only completes each operation into one of its declared stable phases', () => {
    const imageLoad = startImageLoad(createDatasetWorkflowState(WORKFLOW_PHASE.DATASET_READY));
    const save = startSave(createDatasetWorkflowState());
    const datasetLoad = startDatasetLoad(createDatasetWorkflowState());
    const selectedDatasetLoad = selectDatasetTarget(datasetLoad.state, datasetLoad.operationId, {
      path: 'C:/datasets/B.json',
      fileName: 'B.json',
    });

    expect(completeOperation(imageLoad.state, imageLoad.operationId, WORKFLOW_PHASE.EMPTY).success).toBe(false);
    expect(completeOperation(save.state, save.operationId, WORKFLOW_PHASE.DATASET_ERROR).success).toBe(false);
    expect(completeOperation(selectedDatasetLoad.state, datasetLoad.operationId, WORKFLOW_PHASE.READY).success).toBe(
      false,
    );
  });

  it('defaults a selected dataset load failure to the dataset-error position', () => {
    const started = startDatasetLoad(createDatasetWorkflowState());
    const selected = selectDatasetTarget(started.state, started.operationId, {
      path: 'C:/datasets/B.json',
      fileName: 'B.json',
    });
    const failed = failOperation(selected.state, started.operationId);

    expect(failed.success).toBe(true);
    expect(failed.state.phase).toBe(WORKFLOW_PHASE.DATASET_ERROR);
    expect(failed.state.datasetTarget).toEqual({ path: 'C:/datasets/B.json', fileName: 'B.json' });
  });
});

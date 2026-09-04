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
  operationReturnsTo,
  startDatasetLoad,
  startImageLoad,
  startSave,
} from '../src/renderer/src/state/WorkflowState.js';

describe('Workflow state', () => {
  it('moves from ready through saving and back to ready', () => {
    const initial = createWorkflowState(WORKFLOW_PHASE.READY);
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
    const saving = startSave(createWorkflowState(WORKFLOW_PHASE.READY)).state;

    expect(startImageLoad(saving).success).toBe(false);
    expect(startDatasetLoad(saving).success).toBe(false);
    expect(startSave(saving).success).toBe(false);
  });

  it('exposes operation permissions from the same rules used by transitions', () => {
    const empty = createWorkflowState(WORKFLOW_PHASE.EMPTY);
    const datasetReady = createWorkflowState(WORKFLOW_PHASE.DATASET_READY);
    const ready = createWorkflowState(WORKFLOW_PHASE.READY);
    const saving = startSave(ready).state;

    expect(canStartOperation(empty, WORKFLOW_OPERATION.LOAD_DATASET)).toBe(true);
    expect(canStartOperation(empty, WORKFLOW_OPERATION.LOAD_IMAGE)).toBe(false);
    expect(canStartOperation(datasetReady, WORKFLOW_OPERATION.LOAD_IMAGE)).toBe(true);
    expect(canStartOperation(ready, WORKFLOW_OPERATION.SAVE)).toBe(true);
    expect(canStartOperation(saving, WORKFLOW_OPERATION.LOAD_DATASET)).toBe(false);
  });

  it('exposes editing and quad-selection capabilities', () => {
    const ready = createWorkflowState(WORKFLOW_PHASE.READY);
    const loadingImage = startImageLoad(ready).state;
    const saving = startSave(ready).state;

    expect(canEdit(ready)).toBe(true);
    expect(canEdit(loadingImage)).toBe(false);
    expect(canChangeQuadSelection(loadingImage)).toBe(true);
    expect(canChangeQuadSelection(saving)).toBe(false);
  });

  it('does not let a stale operation complete a newer operation', () => {
    const first = startImageLoad(createWorkflowState(WORKFLOW_PHASE.READY));
    const returned = failOperation(first.state, first.operationId).state;
    const second = startImageLoad(returned);

    expect(isCurrentOperation(second.state, first.operationId)).toBe(false);
    expect(completeOperation(second.state, first.operationId).success).toBe(false);
    expect(second.state.operation.id).toBe(second.operationId);
  });

  it('increments the dataset version only when a dataset is committed', () => {
    const started = startDatasetLoad(createWorkflowState(WORKFLOW_PHASE.EMPTY));
    const committed = commitDataset(started.state, started.operationId);

    expect(committed.success).toBe(true);
    expect(committed.state.phase).toBe(WORKFLOW_PHASE.DATASET_READY);
    expect(committed.state.datasetVersion).toBe(1);
  });

  it('prevents an old operation context from applying to a new dataset version', () => {
    const saving = startSave(createWorkflowState(WORKFLOW_PHASE.READY));
    const changedDatasetState = { ...saving.state, datasetVersion: saving.state.datasetVersion + 1 };

    expect(canApplyOperationResult(changedDatasetState, saving.operationId)).toBe(false);
  });

  it('applies a save result only to its captured image', () => {
    const saving = startSave(createWorkflowState(WORKFLOW_PHASE.READY), { sourceImageIndex: 2 });

    expect(canApplySaveResult(saving.state, saving.operationId, 2)).toBe(true);
    expect(canApplySaveResult(saving.state, saving.operationId, 3)).toBe(false);
  });

  it('returns to the captured stable phase after failure', () => {
    const started = startImageLoad(createWorkflowState(WORKFLOW_PHASE.DATASET_READY));

    expect(operationReturnsTo(started.state, started.operationId, WORKFLOW_PHASE.DATASET_READY)).toBe(true);
    expect(operationReturnsTo(started.state, started.operationId, WORKFLOW_PHASE.READY)).toBe(false);

    const failed = failOperation(started.state, started.operationId);

    expect(failed.success).toBe(true);
    expect(failed.state.phase).toBe(WORKFLOW_PHASE.DATASET_READY);
  });

});

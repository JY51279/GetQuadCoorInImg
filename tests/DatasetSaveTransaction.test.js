import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  SAVE_TRANSACTION_STATUS,
  useDatasetSaveTransaction,
} from '../src/renderer/src/composables/useDatasetSaveTransaction.js';
import { WORKFLOW_PHASE, createWorkflowState, startSave } from '../src/renderer/src/state/WorkflowState.js';

function createTransaction(overrides = {}) {
  const workflowState = overrides.workflowState ?? ref(createWorkflowState(WORKFLOW_PHASE.READY));
  const imageIndex = overrides.imageIndex ?? ref(0);
  const saveJsonFile = overrides.saveJsonFile ?? vi.fn(async () => true);
  const createSnapshot = overrides.createSnapshot ?? vi.fn(() => 'snapshot');
  const restoreSnapshot = overrides.restoreSnapshot ?? vi.fn(() => true);
  const transaction = useDatasetSaveTransaction({
    workflowState,
    getCurrentImageIndex: () => imageIndex.value,
    saveJsonFile,
    createSnapshot,
    restoreSnapshot,
  });
  return { transaction, workflowState, imageIndex, saveJsonFile, createSnapshot, restoreSnapshot };
}

describe('Dataset save transaction', () => {
  it('runs all in-memory mutations with one save and completes the workflow', async () => {
    const context = createTransaction();
    const mutations = [];

    const result = await context.transaction.run(() => {
      mutations.push('first', 'second', 'third');
      return null;
    });

    expect(result).toEqual({
      success: true,
      status: SAVE_TRANSACTION_STATUS.SAVED,
      error: '',
      rollbackFailed: false,
    });
    expect(mutations).toEqual(['first', 'second', 'third']);
    expect(context.saveJsonFile).toHaveBeenCalledOnce();
    expect(context.restoreSnapshot).not.toHaveBeenCalled();
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
  });

  it('restores the snapshot after a mutation error or exception', async () => {
    const errorContext = createTransaction();
    const errorResult = await errorContext.transaction.run(() => 'Invalid Quad.');
    expect(errorResult).toMatchObject({
      success: false,
      status: SAVE_TRANSACTION_STATUS.MUTATION_FAILED,
      error: 'Invalid Quad.',
      rollbackFailed: false,
    });
    expect(errorContext.restoreSnapshot).toHaveBeenCalledWith('snapshot');
    expect(errorContext.saveJsonFile).not.toHaveBeenCalled();

    const thrownContext = createTransaction();
    const thrownResult = await thrownContext.transaction.run(() => {
      throw new Error('mutation crashed');
    });
    expect(thrownResult).toMatchObject({
      status: SAVE_TRANSACTION_STATUS.MUTATION_FAILED,
      error: 'JSON operation failed: mutation crashed',
    });
    expect(thrownContext.restoreSnapshot).toHaveBeenCalledWith('snapshot');
  });

  it('restores the snapshot after the file save fails', async () => {
    const context = createTransaction({ saveJsonFile: vi.fn(async () => false) });

    const result = await context.transaction.run(() => null);

    expect(result).toMatchObject({
      success: false,
      status: SAVE_TRANSACTION_STATUS.SAVE_FAILED,
      rollbackFailed: false,
    });
    expect(context.restoreSnapshot).toHaveBeenCalledWith('snapshot');
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
  });

  it('does not restore data when a save result belongs to an old image context', async () => {
    const imageIndex = ref(0);
    const context = createTransaction({
      imageIndex,
      saveJsonFile: vi.fn(async () => {
        imageIndex.value = 1;
        return true;
      }),
    });

    const result = await context.transaction.run(() => null);

    expect(result).toMatchObject({
      success: false,
      status: SAVE_TRANSACTION_STATUS.STALE,
      error: 'Ignored a stale save result because the dataset or image context changed.',
    });
    expect(context.restoreSnapshot).not.toHaveBeenCalled();
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
  });

  it('falls back to dataset-ready when rollback is impossible', async () => {
    const context = createTransaction({ restoreSnapshot: vi.fn(() => false) });

    const result = await context.transaction.run(() => 'Invalid Quad.');

    expect(result).toMatchObject({
      status: SAVE_TRANSACTION_STATUS.MUTATION_FAILED,
      rollbackFailed: true,
    });
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.DATASET_READY);
  });

  it('rejects a new save while another workflow operation is active', async () => {
    const activeSave = startSave(createWorkflowState(WORKFLOW_PHASE.READY));
    const context = createTransaction({ workflowState: ref(activeSave.state) });

    const result = await context.transaction.run(() => null);

    expect(result).toMatchObject({
      success: false,
      status: SAVE_TRANSACTION_STATUS.START_FAILED,
      error: 'Cannot start save while workflow is saving.',
    });
    expect(context.createSnapshot).not.toHaveBeenCalled();
    expect(context.saveJsonFile).not.toHaveBeenCalled();
  });
});

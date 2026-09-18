import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  SAVE_TRANSACTION_STATUS,
  useDatasetSaveTransaction,
} from '../src/renderer/src/composables/useDatasetSaveTransaction.js';
import { WORKFLOW_PHASE, startSave } from '../src/renderer/src/state/WorkflowState.js';
import { createDatasetWorkflowState } from './fixtures/WorkflowFixtures.js';

function createMutationResult(id = 'mutation') {
  return {
    success: true,
    changed: true,
    receipt: { entries: [{ id }], direction: 'redo' },
  };
}

function createTransaction(overrides = {}) {
  const workflowState = overrides.workflowState ?? ref(createDatasetWorkflowState());
  const imageIndex = overrides.imageIndex ?? ref(0);
  const saveJsonFile = overrides.saveJsonFile ?? vi.fn(async () => true);
  const rollbackMutation = overrides.rollbackMutation ?? vi.fn(() => ({ success: true }));
  const transaction = useDatasetSaveTransaction({
    workflowState,
    getCurrentImageIndex: () => imageIndex.value,
    saveJsonFile,
    rollbackMutation,
  });
  return { transaction, workflowState, imageIndex, saveJsonFile, rollbackMutation };
}

describe('Dataset save transaction', () => {
  it('saves a reversible in-memory mutation and completes the workflow', async () => {
    const context = createTransaction();
    const mutationResult = createMutationResult();

    const result = await context.transaction.run(() => mutationResult);

    expect(result).toEqual({
      success: true,
      status: SAVE_TRANSACTION_STATUS.SAVED,
      error: '',
      rollbackFailed: false,
      changed: true,
    });
    expect(context.saveJsonFile).toHaveBeenCalledOnce();
    expect(context.rollbackMutation).not.toHaveBeenCalled();
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
  });

  it('completes a no-op without serializing or saving the dataset', async () => {
    const context = createTransaction();

    const result = await context.transaction.run(() => ({ success: true, changed: false, receipt: null }));

    expect(result).toEqual({
      success: true,
      status: SAVE_TRANSACTION_STATUS.UNCHANGED,
      error: '',
      rollbackFailed: false,
      changed: false,
    });
    expect(context.saveJsonFile).not.toHaveBeenCalled();
    expect(context.rollbackMutation).not.toHaveBeenCalled();
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
  });

  it('reports a validation failure without rolling back unchanged data', async () => {
    const context = createTransaction();

    const result = await context.transaction.run(() => ({ success: false, error: 'Invalid Quad.' }));

    expect(result).toMatchObject({
      success: false,
      status: SAVE_TRANSACTION_STATUS.MUTATION_FAILED,
      error: 'Invalid Quad.',
      rollbackFailed: false,
      changed: false,
    });
    expect(context.saveJsonFile).not.toHaveBeenCalled();
    expect(context.rollbackMutation).not.toHaveBeenCalled();
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
  });

  it('leaves editing mode when a mutation throws before returning a receipt', async () => {
    const context = createTransaction();

    const result = await context.transaction.run(() => {
      throw new Error('mutation crashed');
    });

    expect(result).toMatchObject({
      status: SAVE_TRANSACTION_STATUS.MUTATION_FAILED,
      error: 'JSON 操作失败。',
      rollbackFailed: true,
    });
    expect(context.rollbackMutation).not.toHaveBeenCalled();
    expect(context.saveJsonFile).not.toHaveBeenCalled();
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.DATASET_READY);
  });

  it('rolls back the mutation receipt after the file save fails', async () => {
    const context = createTransaction({ saveJsonFile: vi.fn(async () => false) });
    const mutationResult = createMutationResult();

    const result = await context.transaction.run(() => mutationResult);

    expect(result).toMatchObject({
      success: false,
      status: SAVE_TRANSACTION_STATUS.SAVE_FAILED,
      rollbackFailed: false,
      changed: true,
    });
    expect(context.rollbackMutation).toHaveBeenCalledWith(mutationResult.receipt);
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
  });

  it('rolls back when the save callback throws', async () => {
    const context = createTransaction({
      saveJsonFile: vi.fn(async () => {
        throw new Error('disk unavailable');
      }),
    });
    const mutationResult = createMutationResult();

    const result = await context.transaction.run(() => mutationResult);

    expect(result).toMatchObject({
      status: SAVE_TRANSACTION_STATUS.SAVE_FAILED,
      error: '保存 JSON 文件失败。',
      rollbackFailed: false,
    });
    expect(context.rollbackMutation).toHaveBeenCalledWith(mutationResult.receipt);
  });

  it('does not roll back a thrown save after the image context has changed', async () => {
    const imageIndex = ref(0);
    const context = createTransaction({
      imageIndex,
      saveJsonFile: vi.fn(async () => {
        imageIndex.value = 1;
        throw new Error('old save failed');
      }),
    });

    const result = await context.transaction.run(() => createMutationResult());

    expect(result).toMatchObject({
      status: SAVE_TRANSACTION_STATUS.STALE,
      error: '图集或图片已切换，已忽略过期的保存失败结果。',
    });
    expect(context.rollbackMutation).not.toHaveBeenCalled();
  });

  it('does not roll back data when a successful save belongs to an old image context', async () => {
    const imageIndex = ref(0);
    const context = createTransaction({
      imageIndex,
      saveJsonFile: vi.fn(async () => {
        imageIndex.value = 1;
        return true;
      }),
    });

    const result = await context.transaction.run(() => createMutationResult());

    expect(result).toMatchObject({
      success: false,
      status: SAVE_TRANSACTION_STATUS.STALE,
      error: '图集或图片已切换，已忽略过期的保存结果。',
      changed: true,
    });
    expect(context.rollbackMutation).not.toHaveBeenCalled();
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
  });

  it('falls back to dataset-ready when receipt rollback is impossible', async () => {
    const context = createTransaction({
      saveJsonFile: vi.fn(async () => false),
      rollbackMutation: vi.fn(() => ({ success: false })),
    });

    const result = await context.transaction.run(() => createMutationResult());

    expect(result).toMatchObject({
      status: SAVE_TRANSACTION_STATUS.SAVE_FAILED,
      rollbackFailed: true,
    });
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.DATASET_READY);
  });

  it('rejects changed data that does not provide a rollback receipt', async () => {
    const context = createTransaction();

    const result = await context.transaction.run(() => ({ success: true, changed: true, receipt: null }));

    expect(result).toMatchObject({
      status: SAVE_TRANSACTION_STATUS.MUTATION_FAILED,
      error: 'JSON 操作修改了数据，但没有返回可用于回滚的变更记录。',
      rollbackFailed: true,
    });
    expect(context.saveJsonFile).not.toHaveBeenCalled();
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.DATASET_READY);
  });

  it('rejects a new save while another workflow operation is active', async () => {
    const activeSave = startSave(createDatasetWorkflowState());
    const context = createTransaction({ workflowState: ref(activeSave.state) });
    const mutate = vi.fn(() => createMutationResult());

    const result = await context.transaction.run(mutate);

    expect(result).toMatchObject({
      success: false,
      status: SAVE_TRANSACTION_STATUS.START_FAILED,
      error: '正在保存数据状态下不能开始保存数据。',
    });
    expect(mutate).not.toHaveBeenCalled();
    expect(context.saveJsonFile).not.toHaveBeenCalled();
  });
});

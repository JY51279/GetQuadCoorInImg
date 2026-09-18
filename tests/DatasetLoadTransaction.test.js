import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import {
  DATASET_LOAD_TRANSACTION_STATUS,
  useDatasetLoadTransaction,
} from '../src/renderer/src/composables/useDatasetLoadTransaction.js';
import { DATASET_LOAD_STATUS } from '../src/renderer/src/services/DatasetLoadService.js';
import { WORKFLOW_PHASE, failOperation, startSave } from '../src/renderer/src/state/WorkflowState.js';
import { DATASET_FILE_STATUS } from '../src/shared/DatasetFileResponse.js';
import { createDatasetWorkflowState } from './fixtures/WorkflowFixtures.js';

const TARGET_A = Object.freeze({ path: 'C:/datasets/A.json', fileName: 'A.json' });
const TARGET_B = Object.freeze({ path: 'C:/datasets/B.json', fileName: 'B.json' });
const PREPARED_DATASET = Object.freeze({
  success: true,
  productType: 'DBR',
  data: { Picture: [] },
});

function createResponse(target = TARGET_B, overrides = {}) {
  return {
    requestId: overrides.requestId ?? 1,
    status: DATASET_FILE_STATUS.READY,
    target,
    jsonInfo: { str: '{"Picture":[]}' },
    error: '',
  };
}

function createContext(overrides = {}) {
  const workflowState =
    overrides.workflowState ?? ref(createDatasetWorkflowState(WORKFLOW_PHASE.READY, { datasetTarget: TARGET_A }));
  const prepareLoad =
    overrides.prepareLoad ??
    vi.fn(async () => ({
      status: DATASET_LOAD_STATUS.READY,
      target: TARGET_B,
      preparedJson: PREPARED_DATASET,
    }));
  const clearDataset = overrides.clearDataset ?? vi.fn();
  const onDatasetTargetSelected = overrides.onDatasetTargetSelected ?? vi.fn();
  const commitPreparedDataset = overrides.commitPreparedDataset ?? vi.fn(() => true);
  const transaction = useDatasetLoadTransaction({
    workflowState,
    resolveImagePaths: vi.fn(),
    saveJsonFile: vi.fn(),
    prepareLoad,
    clearDataset,
    onDatasetTargetSelected,
    commitPreparedDataset,
  });
  return {
    transaction,
    workflowState,
    prepareLoad,
    clearDataset,
    onDatasetTargetSelected,
    commitPreparedDataset,
  };
}

describe('Dataset load transaction', () => {
  it('keeps the current dataset when selection is canceled before a target is chosen', async () => {
    const context = createContext({
      prepareLoad: vi.fn(async () => ({
        status: DATASET_LOAD_STATUS.CANCELED,
        target: null,
        error: '',
      })),
    });

    const result = await context.transaction.run(async requestId => ({
      requestId,
      status: DATASET_FILE_STATUS.CANCELED,
      target: null,
      jsonInfo: null,
      error: '',
    }));

    expect(result).toEqual({
      success: false,
      status: DATASET_LOAD_TRANSACTION_STATUS.CANCELED,
      target: null,
      preparedJson: null,
      error: '',
    });
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
    expect(context.workflowState.value.datasetTarget).toEqual(TARGET_A);
    expect(context.clearDataset).not.toHaveBeenCalled();
    expect(context.onDatasetTargetSelected).not.toHaveBeenCalled();
  });

  it('keeps a rejected target as the current dataset position', async () => {
    const context = createContext({
      prepareLoad: vi.fn(async () => ({
        status: DATASET_LOAD_STATUS.FAILED,
        target: TARGET_B,
        error: 'B.json 不符合图集规则。',
      })),
    });

    const result = await context.transaction.run(async () => createResponse());

    expect(result).toMatchObject({
      status: DATASET_LOAD_TRANSACTION_STATUS.FAILED,
      target: TARGET_B,
      error: 'B.json 不符合图集规则。',
    });
    expect(context.clearDataset).toHaveBeenCalledOnce();
    expect(context.onDatasetTargetSelected).toHaveBeenCalledOnce();
    expect(context.onDatasetTargetSelected).toHaveBeenCalledWith(TARGET_B);
    expect(context.workflowState.value).toMatchObject({
      phase: WORKFLOW_PHASE.DATASET_ERROR,
      datasetVersion: 2,
      datasetTarget: TARGET_B,
      operation: null,
    });
    expect(context.commitPreparedDataset).not.toHaveBeenCalled();
  });

  it('treats cancellation after target selection as a rejected target', async () => {
    const context = createContext({
      prepareLoad: vi.fn(async () => ({
        status: DATASET_LOAD_STATUS.CANCELED,
        target: TARGET_B,
        error: '已取消有损修复。',
      })),
    });

    const result = await context.transaction.run(async () => createResponse());

    expect(result.status).toBe(DATASET_LOAD_TRANSACTION_STATUS.CANCELED);
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.DATASET_ERROR);
    expect(context.workflowState.value.datasetTarget).toEqual(TARGET_B);
  });

  it('commits a prepared dataset and completes at dataset-ready', async () => {
    const context = createContext();

    const result = await context.transaction.run(async () => createResponse());

    expect(result).toEqual({
      success: true,
      status: DATASET_LOAD_TRANSACTION_STATUS.READY,
      target: TARGET_B,
      preparedJson: PREPARED_DATASET,
      error: '',
    });
    expect(context.commitPreparedDataset).toHaveBeenCalledWith(PREPARED_DATASET);
    expect(context.workflowState.value).toMatchObject({
      phase: WORKFLOW_PHASE.DATASET_READY,
      datasetVersion: 2,
      datasetTarget: TARGET_B,
      operation: null,
    });
  });

  it('closes at dataset-error when the prepared dataset cannot be committed', async () => {
    const context = createContext({ commitPreparedDataset: vi.fn(() => false) });

    const result = await context.transaction.run(async () => createResponse());

    expect(result).toMatchObject({
      status: DATASET_LOAD_TRANSACTION_STATUS.FAILED,
      target: TARGET_B,
      error: '加载 JSON 失败：无法提交处理后的数据集。',
    });
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.DATASET_ERROR);
    expect(context.workflowState.value.datasetTarget).toEqual(TARGET_B);
  });

  it('ignores a response after its workflow operation has already ended', async () => {
    const context = createContext();

    const result = await context.transaction.run(async operationId => {
      context.workflowState.value = failOperation(context.workflowState.value, operationId).state;
      return createResponse();
    });

    expect(result.status).toBe(DATASET_LOAD_TRANSACTION_STATUS.STALE);
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
    expect(context.workflowState.value.datasetTarget).toEqual(TARGET_A);
    expect(context.clearDataset).not.toHaveBeenCalled();
    expect(context.onDatasetTargetSelected).not.toHaveBeenCalled();
    expect(context.prepareLoad).not.toHaveBeenCalled();
  });

  it('closes the active operation when the response carries a different request id', async () => {
    const context = createContext();

    const result = await context.transaction.run(async () => createResponse(TARGET_B, { requestId: 99 }));

    expect(result).toMatchObject({
      status: DATASET_LOAD_TRANSACTION_STATUS.FAILED,
      target: null,
      error: '图集文件响应与当前加载操作不匹配。',
    });
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
    expect(context.workflowState.value.operation).toBeNull();
    expect(context.clearDataset).not.toHaveBeenCalled();
    expect(context.onDatasetTargetSelected).not.toHaveBeenCalled();
  });

  it('normalizes thrown and malformed requests into closed failures', async () => {
    const thrownContext = createContext();
    const thrown = await thrownContext.transaction.run(
      async () => {
        throw new Error('disk unavailable');
      },
      { fallbackMessage: '打开图集失败。' },
    );

    expect(thrown).toMatchObject({
      status: DATASET_LOAD_TRANSACTION_STATUS.FAILED,
      error: '打开图集失败。',
    });
    expect(thrownContext.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);

    const malformedContext = createContext();
    const malformed = await malformedContext.transaction.run(async () => null, {
      fallbackMessage: '切换图集失败。',
    });

    expect(malformed).toMatchObject({
      status: DATASET_LOAD_TRANSACTION_STATUS.FAILED,
      error: '切换图集失败。',
    });
    expect(malformedContext.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
  });

  it('does not issue a request when another operation is active', async () => {
    const activeSave = startSave(createDatasetWorkflowState(WORKFLOW_PHASE.READY, { datasetTarget: TARGET_A }), {
      sourceImageIndex: 0,
    });
    const context = createContext({ workflowState: ref(activeSave.state) });
    const requestDataset = vi.fn();

    const result = await context.transaction.run(requestDataset);

    expect(result.status).toBe(DATASET_LOAD_TRANSACTION_STATUS.START_FAILED);
    expect(requestDataset).not.toHaveBeenCalled();
    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.SAVING);
  });
});

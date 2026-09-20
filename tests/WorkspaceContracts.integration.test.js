import { prepareJsonProcess } from '../src/renderer/src/utils/DatasetPreparation.js';
import { ref } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DATASET_LOAD_TRANSACTION_STATUS,
  useDatasetLoadTransaction,
} from '../src/renderer/src/composables/useDatasetLoadTransaction.js';
import {
  SAVE_TRANSACTION_STATUS,
  useDatasetSaveTransaction,
} from '../src/renderer/src/composables/useDatasetSaveTransaction.js';
import {
  clearDatasetProcess,
  commitPreparedJsonProcess,
  getCurrentJsonImageIndex,
  getJsonFileInfo,
  getJsonImagePosition,
  resetPicJson,
  updateJsonWithHistory,
} from '../src/renderer/src/state/DatasetState.js';
import { WORKFLOW_PHASE, startImageLoad } from '../src/renderer/src/state/WorkflowState.js';
import { KEYS } from '../src/renderer/src/utils/BasicFuncs.js';
import { DATASET_FILE_STATUS } from '../src/shared/DatasetFileResponse.js';
import { createJsonResponse, createPicture } from './fixtures/DatasetFixtures.js';
import { createDatasetWorkflowState } from './fixtures/WorkflowFixtures.js';

const NEXT_TARGET = Object.freeze({ path: 'C:/datasets/next.json', fileName: 'next.json' });

function deferred() {
  let resolve;
  const promise = new Promise(done => {
    resolve = done;
  });
  return { promise, resolve };
}

function createLoadContext(overrides = {}) {
  const workflowState = ref(createDatasetWorkflowState());
  const resolveImagePaths = vi.fn(async ({ imagePaths }) => ({ success: true, imagePaths }));
  const saveJsonFile = vi.fn(async () => true);
  const confirmLossyRepair = vi.fn(() => false);
  const onDatasetTargetSelected = vi.fn();
  const dependencies = {
    workflowState,
    resolveImagePaths,
    saveJsonFile,
    confirmLossyRepair,
    onDatasetTargetSelected,
    ...overrides,
  };
  return { ...dependencies, transaction: useDatasetLoadTransaction(dependencies) };
}

describe('Workspace behavior contracts across dataset, workflow and transactions', () => {
  beforeEach(() => {
    const prepared = prepareJsonProcess({
      str: JSON.stringify({ Picture: [createPicture('DBR', 'C:/images/one.png')] }),
      path: 'C:/datasets/sample.json',
    });
    expect(commitPreparedJsonProcess(prepared)).toBe(true);
    expect(resetPicJson('C:/images/one.png', 0).success).toBe(true);
  });

  afterEach(clearDatasetProcess);

  it('preserves the committed dataset and selection when the dialog is canceled before selecting a target', async () => {
    const before = getJsonFileInfo();
    const context = createLoadContext();
    const previousTarget = context.workflowState.value.datasetTarget;
    const previousVersion = context.workflowState.value.datasetVersion;

    const result = await context.transaction.run(async requestId => ({
      requestId,
      status: DATASET_FILE_STATUS.CANCELED,
      target: null,
    }));

    expect(result.status).toBe(DATASET_LOAD_TRANSACTION_STATUS.CANCELED);
    expect(context.workflowState.value).toMatchObject({
      phase: WORKFLOW_PHASE.READY,
      operation: null,
      datasetTarget: previousTarget,
      datasetVersion: previousVersion,
    });
    expect(getJsonFileInfo()).toEqual(before);
    expect(getCurrentJsonImageIndex()).toBe(0);
    expect(context.onDatasetTargetSelected).not.toHaveBeenCalled();
    expect(context.resolveImagePaths).not.toHaveBeenCalled();
    expect(context.saveJsonFile).not.toHaveBeenCalled();
  });

  it('retains the newly selected target but clears old data when lossy repair is declined', async () => {
    const context = createLoadContext();
    const previousVersion = context.workflowState.value.datasetVersion;

    const result = await context.transaction.run(async requestId =>
      createJsonResponse([null, createPicture('DBR', 'C:/images/two.png')], { ...NEXT_TARGET, requestId }),
    );

    expect(result.status).toBe(DATASET_LOAD_TRANSACTION_STATUS.CANCELED);
    expect(context.workflowState.value).toMatchObject({
      phase: WORKFLOW_PHASE.DATASET_ERROR,
      operation: null,
      datasetTarget: NEXT_TARGET,
      datasetVersion: previousVersion + 1,
    });
    expect(context.onDatasetTargetSelected).toHaveBeenCalledExactlyOnceWith(NEXT_TARGET);
    expect(context.confirmLossyRepair).toHaveBeenCalledOnce();
    expect(getJsonFileInfo().path).toBe('');
    expect(JSON.parse(getJsonFileInfo().str)).toEqual({});
    expect(getJsonImagePosition()).toEqual({ currentIndex: -1, total: 0 });
    expect(context.resolveImagePaths).not.toHaveBeenCalled();
    expect(context.saveJsonFile).not.toHaveBeenCalled();
  });

  it.each([true, false])('commits an approved repair only after persistence succeeds (saved=%s)', async saved => {
    const persistence = deferred();
    const persistenceStarted = deferred();
    const context = createLoadContext({
      confirmLossyRepair: vi.fn(() => true),
      saveJsonFile: vi.fn(() => {
        persistenceStarted.resolve();
        return persistence.promise;
      }),
    });

    const pendingLoad = context.transaction.run(async requestId =>
      createJsonResponse([null, createPicture('DBR', 'C:/images/two.png')], { ...NEXT_TARGET, requestId }),
    );
    await persistenceStarted.promise;

    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.LOADING_DATASET);
    expect(context.workflowState.value.datasetTarget).toEqual(NEXT_TARGET);
    expect(getJsonFileInfo().path).toBe('');
    expect(getJsonImagePosition()).toEqual({ currentIndex: -1, total: 0 });
    expect(context.saveJsonFile).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ path: NEXT_TARGET.path }), {
      backupOriginal: true,
    });

    persistence.resolve(saved);
    const result = await pendingLoad;

    expect(result.status).toBe(saved ? DATASET_LOAD_TRANSACTION_STATUS.READY : DATASET_LOAD_TRANSACTION_STATUS.FAILED);
    expect(context.workflowState.value).toMatchObject({
      phase: saved ? WORKFLOW_PHASE.DATASET_READY : WORKFLOW_PHASE.DATASET_ERROR,
      operation: null,
      datasetTarget: NEXT_TARGET,
    });
    expect(getJsonFileInfo().path).toBe(saved ? NEXT_TARGET.path : '');
    expect(getJsonImagePosition()).toEqual({ currentIndex: -1, total: saved ? 1 : 0 });
    if (saved) {
      expect(JSON.parse(getJsonFileInfo().str)).toEqual(JSON.parse(context.saveJsonFile.mock.calls[0][0].str));
    } else {
      expect(JSON.parse(getJsonFileInfo().str)).toEqual({});
    }
  });

  it('rejects conflicting operations while saving and rolls back the real mutation on failure', async () => {
    const before = getJsonFileInfo();
    const persistence = deferred();
    const context = createLoadContext();
    const saveJsonFile = vi.fn(() => persistence.promise);
    const saveTransaction = useDatasetSaveTransaction({
      workflowState: context.workflowState,
      getCurrentImageIndex: getCurrentJsonImageIndex,
      saveJsonFile,
    });
    const pendingSave = saveTransaction.run(() =>
      updateJsonWithHistory(KEYS.JSON_MODIFY, 1, 0, [{ x: 9, y: 1 }], { width: 1000, height: 1000 }),
    );
    const pendingData = getJsonFileInfo();
    const activeOperation = context.workflowState.value.operation;

    expect(context.workflowState.value.phase).toBe(WORKFLOW_PHASE.SAVING);
    expect(pendingData.str).not.toBe(before.str);

    const conflictingMutation = vi.fn();
    const requestDataset = vi.fn();
    expect((await saveTransaction.run(conflictingMutation)).status).toBe(SAVE_TRANSACTION_STATUS.START_FAILED);
    expect((await context.transaction.run(requestDataset)).status).toBe(DATASET_LOAD_TRANSACTION_STATUS.START_FAILED);
    expect(startImageLoad(context.workflowState.value).success).toBe(false);
    expect(conflictingMutation).not.toHaveBeenCalled();
    expect(requestDataset).not.toHaveBeenCalled();
    expect(context.onDatasetTargetSelected).not.toHaveBeenCalled();
    expect(context.saveJsonFile).not.toHaveBeenCalled();
    expect(context.workflowState.value.operation).toEqual(activeOperation);
    expect(getJsonFileInfo()).toEqual(pendingData);

    persistence.resolve(false);
    expect(await pendingSave).toMatchObject({
      status: SAVE_TRANSACTION_STATUS.SAVE_FAILED,
      rollbackFailed: false,
      changed: true,
    });
    expect(context.workflowState.value).toMatchObject({ phase: WORKFLOW_PHASE.READY, operation: null });
    expect(getJsonFileInfo()).toEqual(before);
    expect(getCurrentJsonImageIndex()).toBe(0);
    expect(saveJsonFile).toHaveBeenCalledOnce();
  });
});

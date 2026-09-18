import { ref } from 'vue';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SAVE_TRANSACTION_STATUS,
  useDatasetSaveTransaction,
} from '../src/renderer/src/composables/useDatasetSaveTransaction.js';
import {
  commitPreparedJsonProcess,
  copyPreviousQuadLocationWithHistory,
  getCurrentJsonImageIndex,
  getJsonFileInfo,
  prepareJsonProcess,
  resetPicJson,
  updateJsonWithHistory,
} from '../src/renderer/src/state/DatasetState.js';
import { WORKFLOW_PHASE } from '../src/renderer/src/state/WorkflowState.js';
import { KEYS } from '../src/renderer/src/utils/BasicFuncs.js';
import { createPicture } from './fixtures/DatasetFixtures.js';
import { createDatasetWorkflowState } from './fixtures/WorkflowFixtures.js';

function loadDataset() {
  const prepared = prepareJsonProcess({
    str: JSON.stringify({ Picture: [createPicture('DBR', 'C:/images/one.png')] }),
    path: 'C:/datasets/sample.json',
  });
  if (!prepared.success || !commitPreparedJsonProcess(prepared)) {
    throw new Error('Failed to prepare the integration-test dataset.');
  }
  const selected = resetPicJson('C:/images/one.png', 0);
  if (!selected.success) throw new Error(selected.error);
}

function loadCopyDataset() {
  const prepared = prepareJsonProcess({
    str: JSON.stringify({
      Picture: [
        createPicture('DBR', 'C:/images/one.png', '5 5 15 5 15 15 5 15'),
        { ...createPicture('DBR', 'C:/images/two.png', '20 20 30 20 30 30 20 30'), 'No.': '2' },
      ],
    }),
    path: 'C:/datasets/sample.json',
  });
  if (!prepared.success || !commitPreparedJsonProcess(prepared)) {
    throw new Error('Failed to prepare the copy integration-test dataset.');
  }
  const selected = resetPicJson('C:/images/two.png', 1);
  if (!selected.success) throw new Error(selected.error);
}

function createTransaction(saveJsonFile) {
  const workflowState = ref(createDatasetWorkflowState());
  const transaction = useDatasetSaveTransaction({
    workflowState,
    getCurrentImageIndex: getCurrentJsonImageIndex,
    saveJsonFile,
  });
  return { transaction, workflowState };
}

describe('Dataset persistence integration', () => {
  beforeEach(loadDataset);

  it('rolls back the real dataset mutation when persistence fails', async () => {
    const before = getJsonFileInfo().str;
    const saveJsonFile = vi.fn(async () => false);
    const { transaction, workflowState } = createTransaction(saveJsonFile);

    const result = await transaction.run(() => updateJsonWithHistory(KEYS.JSON_MODIFY, 1, 0, [{ x: 9, y: 1 }]));

    expect(result).toMatchObject({
      status: SAVE_TRANSACTION_STATUS.SAVE_FAILED,
      rollbackFailed: false,
      changed: true,
    });
    expect(getJsonFileInfo().str).toBe(before);
    expect(saveJsonFile).toHaveBeenCalledOnce();
    expect(workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
  });

  it('keeps a successfully persisted mutation in the real dataset state', async () => {
    const before = getJsonFileInfo().str;
    const saveJsonFile = vi.fn(async () => true);
    const { transaction, workflowState } = createTransaction(saveJsonFile);

    const result = await transaction.run(() => updateJsonWithHistory(KEYS.JSON_MODIFY, 1, 0, [{ x: 9, y: 1 }]));

    expect(result.status).toBe(SAVE_TRANSACTION_STATUS.SAVED);
    expect(getJsonFileInfo().str).not.toBe(before);
    expect(JSON.parse(getJsonFileInfo().str).Picture[0]['Barcode Info'][0]['Barcode Location']).toBe(
      '0 0 9 1 10 10 0 10',
    );
    expect(workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
  });

  it('skips persistence for a real no-op mutation', async () => {
    const before = getJsonFileInfo().str;
    const saveJsonFile = vi.fn(async () => true);
    const { transaction } = createTransaction(saveJsonFile);

    const result = await transaction.run(() => updateJsonWithHistory(KEYS.JSON_MODIFY, 1, 0, [{ x: 0, y: 0 }]));

    expect(result.status).toBe(SAVE_TRANSACTION_STATUS.UNCHANGED);
    expect(getJsonFileInfo().str).toBe(before);
    expect(saveJsonFile).not.toHaveBeenCalled();
  });

  it('rolls back a copied previous-image location when persistence fails', async () => {
    loadCopyDataset();
    const before = getJsonFileInfo().str;
    const saveJsonFile = vi.fn(async () => false);
    const { transaction } = createTransaction(saveJsonFile);

    const result = await transaction.run(() => copyPreviousQuadLocationWithHistory(0, { width: 100, height: 100 }));

    expect(result).toMatchObject({
      status: SAVE_TRANSACTION_STATUS.SAVE_FAILED,
      rollbackFailed: false,
      changed: true,
    });
    expect(getJsonFileInfo().str).toBe(before);
    expect(saveJsonFile).toHaveBeenCalledOnce();
  });
});

import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';
import { ref } from 'vue';
import { getBackupMessage } from '../../../shared/JsonSaveResult.js';
import { DATASET_LOAD_TRANSACTION_STATUS, useDatasetLoadTransaction } from './useDatasetLoadTransaction.js';
import { getJsonImageTarget, getJsonImageTargetByPath } from '../state/DatasetState.js';
import { USER_MESSAGES } from '../../../shared/UserMessages.js';
import { createCanceledDatasetFileResponse, DATASET_FILE_STATUS } from '../../../shared/DatasetFileResponse.js';
import { KEYS } from '../utils/BasicFuncs.js';

// Coordinates selection, repair/commit and startup restoration; the transaction owns domain writes.
export function useWorkspaceDataset({
  workflowState,
  invoke,
  isActive,
  outputMessage,
  saveJsonFile,
  confirmLossyRepair,
  getWorkspaceSession,
  recordDatasetTarget,
  onDatasetReset,
  startDatasetImageRequest,
  showDatasetPanel,
  showAnnotationPanel,
}) {
  const loadedProductType = ref('');
  const datasetLoadError = ref(null);
  const { run: executeDatasetLoadTransaction } = useDatasetLoadTransaction({
    workflowState,
    confirmLossyRepair,
    saveJsonFile,
    isActive,
    resolveImagePaths: request => invoke(IPC_CHANNELS.RESOLVE_IMAGE_PATHS, request),
    onDatasetTargetSelected: handleDatasetTargetSelected,
  });

  function resetViewForDatasetSelection() {
    loadedProductType.value = '';
    datasetLoadError.value = null;
    onDatasetReset();
  }

  function handleDatasetTargetSelected(target) {
    resetViewForDatasetSelection();
    recordDatasetTarget(target.path);
  }

  function getRestoredImageTarget(session) {
    if (session?.imagePath) {
      const restoredTarget = getJsonImageTargetByPath(session.imagePath, session.imageIndex);
      if (restoredTarget.success) return restoredTarget;
    }
    return getJsonImageTarget(0);
  }

  async function restoreWorkspaceSession() {
    let restoredSession = null;

    return runDatasetLoad(
      async requestId => {
        const loaded = await getWorkspaceSession();
        if (!isActive()) return createCanceledDatasetFileResponse(requestId);
        if (!loaded.success) {
          return {
            requestId,
            status: DATASET_FILE_STATUS.FAILED,
            target: null,
            jsonInfo: null,
            error: loaded.error,
            errorKind: loaded.errorKind,
          };
        }
        restoredSession = loaded.session;
        if (!restoredSession) return createCanceledDatasetFileResponse(requestId);

        return invoke(IPC_CHANNELS.READ_DATASET, {
          filePath: restoredSession.datasetPath,
          requestId,
        });
      },
      {
        fallbackMessage: '恢复上次图集失败。',
        getInitialImageTarget: () => getRestoredImageTarget(restoredSession),
      },
    );
  }

  async function runDatasetLoad(requestDataset, { fallbackMessage, getInitialImageTarget = null } = {}) {
    const result = await executeDatasetLoadTransaction(requestDataset, { fallbackMessage });
    if (!isActive() || result.status === DATASET_LOAD_TRANSACTION_STATUS.STALE) return false;
    if (result.backupPath) outputMessage(getBackupMessage(result.backupPath));
    if (result.status !== DATASET_LOAD_TRANSACTION_STATUS.READY) {
      if (result.error) outputMessage(result.error);
      if (result.target) {
        datasetLoadError.value = {
          path: result.target.path,
          message: result.error || USER_MESSAGES.JSON_READ_FAILED,
        };
        showDatasetPanel();
      }
      return false;
    }

    const { preparedJson } = result;
    loadedProductType.value = preparedJson.productType;
    datasetLoadError.value = null;
    showAnnotationPanel();
    if (preparedJson.repairSummary) outputMessage(preparedJson.repairSummary);

    if (preparedJson.data.Picture.length === 0) {
      outputMessage('JSON 已加载，但数据集中没有有效的图片项。');
      return true;
    }

    const firstImageTarget = getInitialImageTarget?.() ?? getJsonImageTarget(0);
    if (!firstImageTarget.success) {
      outputMessage(firstImageTarget.error);
      return true;
    }
    startDatasetImageRequest(firstImageTarget, KEYS.NEXT);
    return true;
  }

  function chooseJsonFile() {
    showDatasetPanel();
    return runDatasetLoad(requestId => invoke(IPC_CHANNELS.OPEN_DATASET, { requestId }), {
      fallbackMessage: USER_MESSAGES.JSON_OPEN_FAILED,
    });
  }

  function changeDatasetByDirection(direction) {
    const currentFilePath = workflowState.value.datasetTarget?.path;
    if (!currentFilePath) {
      outputMessage(USER_MESSAGES.NO_DATASET);
      return;
    }

    return runDatasetLoad(
      requestId =>
        invoke(IPC_CHANNELS.ADJACENT_DATASET, {
          currentFilePath,
          direction,
          requestId,
        }),
      { fallbackMessage: USER_MESSAGES.DATASET_SWITCH_FAILED },
    );
  }

  return { loadedProductType, datasetLoadError, restoreWorkspaceSession, chooseJsonFile, changeDatasetByDirection };
}

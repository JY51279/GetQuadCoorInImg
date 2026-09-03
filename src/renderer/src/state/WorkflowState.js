export const WORKFLOW_PHASE = Object.freeze({
  EMPTY: 'empty',
  DATASET_READY: 'dataset-ready',
  READY: 'ready',
  LOADING_DATASET: 'loading-dataset',
  LOADING_IMAGE: 'loading-image',
  SAVING: 'saving',
});

export const WORKFLOW_OPERATION = Object.freeze({
  LOAD_DATASET: 'load-dataset',
  LOAD_IMAGE: 'load-image',
  SAVE: 'save',
});

const STABLE_PHASES = new Set([WORKFLOW_PHASE.EMPTY, WORKFLOW_PHASE.DATASET_READY, WORKFLOW_PHASE.READY]);

const OPERATION_PHASES = Object.freeze({
  [WORKFLOW_OPERATION.LOAD_DATASET]: WORKFLOW_PHASE.LOADING_DATASET,
  [WORKFLOW_OPERATION.LOAD_IMAGE]: WORKFLOW_PHASE.LOADING_IMAGE,
  [WORKFLOW_OPERATION.SAVE]: WORKFLOW_PHASE.SAVING,
});

const ALLOWED_START_PHASES = Object.freeze({
  [WORKFLOW_OPERATION.LOAD_DATASET]: STABLE_PHASES,
  [WORKFLOW_OPERATION.LOAD_IMAGE]: new Set([WORKFLOW_PHASE.DATASET_READY, WORKFLOW_PHASE.READY]),
  [WORKFLOW_OPERATION.SAVE]: new Set([WORKFLOW_PHASE.DATASET_READY, WORKFLOW_PHASE.READY]),
});

export function createWorkflowState(phase = WORKFLOW_PHASE.EMPTY) {
  if (!STABLE_PHASES.has(phase)) throw new Error(`Invalid initial workflow phase: ${phase}`);
  return {
    phase,
    operationId: 0,
    operation: null,
    datasetVersion: 0,
  };
}

function failure(state, error) {
  return { success: false, state, error };
}

function success(state, operationId = null) {
  return { success: true, state, operationId };
}

function startOperation(state, type, context = {}) {
  if (!state || !ALLOWED_START_PHASES[type]) return failure(state, 'Unknown workflow operation.');
  if (state.operation !== null || !ALLOWED_START_PHASES[type].has(state.phase)) {
    return failure(state, `Cannot start ${type} while workflow is ${state.phase}.`);
  }

  const operationId = state.operationId + 1;
  return success(
    {
      ...state,
      phase: OPERATION_PHASES[type],
      operationId,
      operation: {
        ...context,
        id: operationId,
        type,
        returnPhase: state.phase,
        datasetVersion: state.datasetVersion,
      },
    },
    operationId,
  );
}

export function startDatasetLoad(state, context = {}) {
  return startOperation(state, WORKFLOW_OPERATION.LOAD_DATASET, context);
}

export function startImageLoad(state, context = {}) {
  return startOperation(state, WORKFLOW_OPERATION.LOAD_IMAGE, context);
}

export function startSave(state, context = {}) {
  return startOperation(state, WORKFLOW_OPERATION.SAVE, context);
}

export function isCurrentOperation(state, operationId, type = null) {
  return (
    Number.isInteger(operationId) &&
    state?.operation?.id === operationId &&
    (type === null || state.operation.type === type)
  );
}

export function updateOperationContext(state, operationId, context = {}) {
  if (!isCurrentOperation(state, operationId)) return failure(state, 'The workflow operation is no longer current.');
  return success({
    ...state,
    operation: {
      ...state.operation,
      ...context,
      id: state.operation.id,
      type: state.operation.type,
      returnPhase: state.operation.returnPhase,
      datasetVersion: state.operation.datasetVersion,
    },
  });
}

export function completeOperation(state, operationId, nextPhase = null) {
  if (!isCurrentOperation(state, operationId)) return failure(state, 'The workflow operation is no longer current.');
  const completedPhase = nextPhase ?? state.operation.returnPhase;
  if (!STABLE_PHASES.has(completedPhase)) return failure(state, `Invalid completion phase: ${completedPhase}.`);
  return success({ ...state, phase: completedPhase, operation: null });
}

export function failOperation(state, operationId, fallbackPhase = null) {
  return completeOperation(state, operationId, fallbackPhase);
}

export function commitDataset(state, operationId) {
  if (!isCurrentOperation(state, operationId, WORKFLOW_OPERATION.LOAD_DATASET)) {
    return failure(state, 'The dataset load operation is no longer current.');
  }
  return success({
    ...state,
    phase: WORKFLOW_PHASE.DATASET_READY,
    operation: null,
    datasetVersion: state.datasetVersion + 1,
  });
}

export function canApplyOperationResult(state, operationId) {
  return isCurrentOperation(state, operationId) && state.operation.datasetVersion === state.datasetVersion;
}

export function isWorkflowBusy(state) {
  return state?.operation !== null;
}

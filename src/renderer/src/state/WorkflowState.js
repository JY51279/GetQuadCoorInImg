export const WORKFLOW_PHASE = Object.freeze({
  EMPTY: 'empty',
  DATASET_ERROR: 'dataset-error',
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

const STABLE_PHASES = new Set([
  WORKFLOW_PHASE.EMPTY,
  WORKFLOW_PHASE.DATASET_ERROR,
  WORKFLOW_PHASE.DATASET_READY,
  WORKFLOW_PHASE.READY,
]);

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

const OPERATION_LABELS = Object.freeze({
  [WORKFLOW_OPERATION.LOAD_DATASET]: '加载图集',
  [WORKFLOW_OPERATION.LOAD_IMAGE]: '加载图片',
  [WORKFLOW_OPERATION.SAVE]: '保存数据',
});

const PHASE_LABELS = Object.freeze({
  [WORKFLOW_PHASE.EMPTY]: '未加载图集',
  [WORKFLOW_PHASE.DATASET_ERROR]: '图集加载失败',
  [WORKFLOW_PHASE.DATASET_READY]: '图集已加载',
  [WORKFLOW_PHASE.READY]: '可编辑',
  [WORKFLOW_PHASE.LOADING_DATASET]: '正在加载图集',
  [WORKFLOW_PHASE.LOADING_IMAGE]: '正在加载图片',
  [WORKFLOW_PHASE.SAVING]: '正在保存数据',
});

export function createWorkflowState(phase = WORKFLOW_PHASE.EMPTY) {
  if (!STABLE_PHASES.has(phase)) throw new Error(`初始工作流状态无效：${phase}`);
  return {
    phase,
    operationId: 0,
    operation: null,
    datasetVersion: 0,
    datasetTarget: null,
  };
}

function failure(state, error) {
  return { success: false, state, error };
}

function success(state, operationId = null) {
  return { success: true, state, operationId };
}

export function canStartOperation(state, type) {
  return Boolean(state && ALLOWED_START_PHASES[type]?.has(state.phase) && state.operation === null);
}

export function canEdit(state) {
  return state?.phase === WORKFLOW_PHASE.READY && state.operation === null;
}

export function canChangeQuadSelection(state) {
  return state?.phase === WORKFLOW_PHASE.READY;
}

function startOperation(state, type, context = {}) {
  if (!state || !ALLOWED_START_PHASES[type]) return failure(state, '工作流操作无效。');
  if (!canStartOperation(state, type)) {
    return failure(state, `${PHASE_LABELS[state?.phase] ?? '当前'}状态下不能开始${OPERATION_LABELS[type]}。`);
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

export function isOperationActive(state, type) {
  return Boolean(state && OPERATION_PHASES[type] === state.phase && state.operation?.type === type);
}

export function operationReturnsTo(state, operationId, phase) {
  return isCurrentOperation(state, operationId) && STABLE_PHASES.has(phase) && state.operation.returnPhase === phase;
}

export function completeOperation(state, operationId, nextPhase = null) {
  if (!isCurrentOperation(state, operationId)) return failure(state, '该工作流操作已失效。');
  const completedPhase = nextPhase ?? state.operation.returnPhase;
  if (!STABLE_PHASES.has(completedPhase)) return failure(state, `工作流结束状态无效：${completedPhase}。`);
  return success({ ...state, phase: completedPhase, operation: null });
}

export function failOperation(state, operationId, fallbackPhase = null) {
  return completeOperation(state, operationId, fallbackPhase);
}

export function selectDatasetTarget(state, operationId, target) {
  if (!isCurrentOperation(state, operationId, WORKFLOW_OPERATION.LOAD_DATASET)) {
    return failure(state, '图集加载操作已失效。');
  }
  if (typeof target?.path !== 'string' || target.path.length === 0) {
    return failure(state, '图集目标无效。');
  }
  if (state.operation.target) {
    return state.operation.target.path === target.path
      ? success(state, operationId)
      : failure(state, '图集加载操作已绑定其他目标。');
  }

  const datasetVersion = state.datasetVersion + 1;
  return success(
    {
      ...state,
      datasetVersion,
      datasetTarget: target,
      operation: {
        ...state.operation,
        target,
        datasetVersion,
      },
    },
    operationId,
  );
}

export function rejectDataset(state, operationId) {
  if (!isCurrentOperation(state, operationId, WORKFLOW_OPERATION.LOAD_DATASET)) {
    return failure(state, '图集加载操作已失效。');
  }
  if (!state.operation.target) return failure(state, '图集加载操作尚未选择目标。');
  return completeOperation(state, operationId, WORKFLOW_PHASE.DATASET_ERROR);
}

export function commitDataset(state, operationId) {
  if (!isCurrentOperation(state, operationId, WORKFLOW_OPERATION.LOAD_DATASET)) {
    return failure(state, '图集加载操作已失效。');
  }
  if (!state.operation.target) return failure(state, '图集加载操作尚未选择目标。');
  return success({
    ...state,
    phase: WORKFLOW_PHASE.DATASET_READY,
    operation: null,
  });
}

export function canApplyOperationResult(state, operationId) {
  return isCurrentOperation(state, operationId) && state.operation.datasetVersion === state.datasetVersion;
}

export function canApplySaveResult(state, operationId, currentImageIndex) {
  return (
    canApplyOperationResult(state, operationId) &&
    state.operation.type === WORKFLOW_OPERATION.SAVE &&
    state.operation.sourceImageIndex === currentImageIndex
  );
}

export function isWorkflowBusy(state) {
  return state?.operation !== null;
}

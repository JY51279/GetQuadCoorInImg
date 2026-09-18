import { WORKFLOW_PHASE, createWorkflowState } from '../../src/renderer/src/state/WorkflowState.js';

export const TEST_DATASET_TARGET = Object.freeze({
  path: 'C:/datasets/sample.json',
  fileName: 'sample.json',
});

export function createDatasetWorkflowState(phase = WORKFLOW_PHASE.READY, overrides = {}) {
  return createWorkflowState({
    phase,
    datasetTarget: overrides.datasetTarget ?? TEST_DATASET_TARGET,
    datasetVersion: overrides.datasetVersion ?? 1,
  });
}

import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { initializeWorkspaceSessionStore } from '../src/main/WorkspaceSessionStore.js';
import {
  handleGetWorkspaceSession,
  handleRecordWorkspaceDataset,
  handleOpenJsonDialog,
  handleResolveJsonImagePaths,
  handleSaveJsonFile,
} from '../src/main/IpcHandlers.js';
import {
  createWorkspaceSessionService,
  observeWorkspaceRecord,
} from '../src/renderer/src/services/WorkspaceSessionService.js';
import { createJsonFileService } from '../src/renderer/src/services/JsonFileService.js';
import { useWorkspaceDataset } from '../src/renderer/src/composables/useWorkspaceDataset.js';
import { createWorkflowState, WORKFLOW_PHASE } from '../src/renderer/src/state/WorkflowState.js';
import { clearDatasetProcess, getJsonFileInfo } from '../src/renderer/src/state/DatasetState.js';
import { IPC_CHANNELS } from '../src/shared/IpcChannels.js';
import { createPicture } from './fixtures/DatasetFixtures.js';

const native = vi.hoisted(() => ({ showOpenDialog: vi.fn() }));
vi.mock('electron', () => ({ dialog: { showOpenDialog: native.showOpenDialog }, ipcMain: { handle: vi.fn() } }));
vi.mock('../src/main/ImageFileReader.js', () => ({ IMAGE_EXTENSIONS: ['png'], prepareImageFile: vi.fn() }));

const directories = [];
const pendingRecords = [];

async function createWorkspace({ readError, initialText } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'quadtool-restore-test-'));
  directories.push(directory);
  const datasetPath = path.join(directory, 'dataset.json');
  await fs.writeFile(datasetPath, JSON.stringify({ Picture: [createPicture('DBR', 'one.png')] }));
  if (initialText !== undefined) await fs.writeFile(path.join(directory, 'workspace-session.json'), initialText);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  if (readError) vi.spyOn(fs, 'readFile').mockRejectedValueOnce(readError);
  // Real store initialization must remain non-fatal, including when file I/O fails.
  await initializeWorkspaceSessionStore({ getPath: () => directory });
  native.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [datasetPath] });
  const handlers = {
    [IPC_CHANNELS.GET_WORKSPACE]: handleGetWorkspaceSession,
    [IPC_CHANNELS.RECORD_DATASET]: handleRecordWorkspaceDataset,
    [IPC_CHANNELS.OPEN_DATASET]: handleOpenJsonDialog,
    [IPC_CHANNELS.RESOLVE_IMAGE_PATHS]: handleResolveJsonImagePaths,
    [IPC_CHANNELS.SAVE_JSON]: handleSaveJsonFile,
  };
  // Only native IPC transport/dialogs are replaced: store, handlers, service and controller are real.
  const invoke = vi.fn(async (channel, request) => {
    if (!handlers[channel]) throw new Error(`Unexpected channel: ${channel}`);
    return handlers[channel](null, request);
  });
  const service = createWorkspaceSessionService({ invoke });
  const workflowState = ref(createWorkflowState());
  const outputMessage = vi.fn();
  const startDatasetImageRequest = vi.fn();
  const dataset = useWorkspaceDataset({
    workflowState,
    invoke,
    isActive: () => true,
    outputMessage,
    getWorkspaceSession: service.get,
    recordDatasetTarget: datasetPath => {
      const operation = observeWorkspaceRecord(service.recordDatasetTarget(datasetPath));
      pendingRecords.push(operation);
      return operation;
    },
    saveJsonFile: createJsonFileService({ invoke }).save,
    confirmLossyRepair: () => false,
    onDatasetReset: vi.fn(),
    startDatasetImageRequest,
    showDatasetPanel: vi.fn(),
    showAnnotationPanel: vi.fn(),
  });
  return { dataset, workflowState, outputMessage, invoke, service, datasetPath, startDatasetImageRequest };
}

afterEach(async () => {
  await Promise.all(pendingRecords.splice(0));
  vi.restoreAllMocks();
  native.showOpenDialog.mockReset();
  clearDatasetProcess();
  for (const directory of directories.splice(0)) {
    if (
      path.dirname(directory) !== path.resolve(os.tmpdir()) ||
      !path.basename(directory).startsWith('quadtool-restore-test-')
    ) {
      throw new Error('Unexpected test cleanup path');
    }
    await fs.rm(directory, { recursive: true, force: true });
  }
});

describe('Workspace restore failure across storage, IPC, service and orchestration', () => {
  it('permits manual loading even when both checkpoint reading and writing are denied', async () => {
    const readError = Object.assign(new Error('test read denied'), { code: 'EACCES' });
    const workspace = await createWorkspace({ readError });
    const originalRename = fs.rename.bind(fs);
    vi.spyOn(fs, 'rename').mockImplementation(async (source, destination) => {
      if (path.basename(destination) === 'workspace-session.json') {
        throw Object.assign(new Error('test checkpoint write denied'), { code: 'EACCES' });
      }
      return originalRename(source, destination);
    });
    await workspace.dataset.restoreWorkspaceSession();
    await expect(workspace.dataset.chooseJsonFile()).resolves.toBe(true);
    await Promise.all(pendingRecords);
    expect(workspace.workflowState.value).toMatchObject({ phase: WORKFLOW_PHASE.DATASET_READY, operation: null });
    expect(workspace.startDatasetImageRequest).toHaveBeenCalledOnce();
    await expect(workspace.service.get()).resolves.toMatchObject({ success: false, session: null });
    expect(
      workspace.outputMessage.mock.calls.filter(([message]) => message.includes('读取上次工作区记录失败。')),
    ).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(
      'Failed to record workspace checkpoint:',
      expect.objectContaining({ success: false }),
    );
  });

  it.each(['EACCES', 'EIO'])('reports %s once, ends loading and still permits manual dataset selection', async code => {
    const readError = Object.assign(new Error('test read failure'), { code });
    const workspace = await createWorkspace({ readError });
    await expect(workspace.dataset.restoreWorkspaceSession()).resolves.toBe(false);
    expect(workspace.workflowState.value).toMatchObject({ phase: WORKFLOW_PHASE.EMPTY, operation: null });
    expect(workspace.outputMessage).toHaveBeenCalledOnce();
    expect(workspace.outputMessage.mock.calls[0][0]).toContain('读取上次工作区记录失败。');
    if (code === 'EACCES') expect(workspace.outputMessage.mock.calls[0][0]).toContain('权限');
    expect(workspace.invoke.mock.calls.map(([channel]) => channel)).toEqual([IPC_CHANNELS.GET_WORKSPACE]);
    await expect(workspace.service.get()).resolves.toMatchObject({
      success: false,
      errorKind: 'operation',
      session: null,
    });

    await expect(workspace.dataset.chooseJsonFile()).resolves.toBe(true);
    await Promise.all(pendingRecords);
    expect(workspace.workflowState.value).toMatchObject({ phase: WORKFLOW_PHASE.DATASET_READY, operation: null });
    expect(workspace.startDatasetImageRequest).toHaveBeenCalledOnce();
    const normalizedPath = workspace.datasetPath.replace(/\\/g, '/');
    expect(getJsonFileInfo().path).toBe(normalizedPath);
    await expect(workspace.service.get()).resolves.toMatchObject({
      success: true,
      session: { datasetPath: normalizedPath },
    });
    expect(
      workspace.outputMessage.mock.calls.filter(([message]) => message.includes('读取上次工作区记录失败。')),
    ).toHaveLength(1);
  });

  it.each([undefined, '{invalid', JSON.stringify({ schemaVersion: 99, datasetPath: 'old.json' })])(
    'keeps missing or incompatible records non-fatal and silent: %s',
    async initialText => {
      const workspace = await createWorkspace({ initialText });
      await expect(workspace.dataset.restoreWorkspaceSession()).resolves.toBe(false);
      expect(workspace.workflowState.value).toMatchObject({ phase: WORKFLOW_PHASE.EMPTY, operation: null });
      expect(workspace.outputMessage).not.toHaveBeenCalled();
      await expect(workspace.service.get()).resolves.toMatchObject({ success: true, session: null });
    },
  );
});

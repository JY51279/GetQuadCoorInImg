import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorkspaceDataset } from '../src/renderer/src/composables/useWorkspaceDataset.js';
import { useWorkspaceImages } from '../src/renderer/src/composables/useWorkspaceImages.js';
import { createWorkflowState, WORKFLOW_PHASE } from '../src/renderer/src/state/WorkflowState.js';
import { getCurrentJsonImageIndex, getJsonFileInfo } from '../src/renderer/src/state/DatasetState.js';
import { createCanceledDatasetFileResponse } from '../src/shared/DatasetFileResponse.js';
import { createJsonResponse, createPicture } from './fixtures/DatasetFixtures.js';
import { KEYS } from '../src/renderer/src/utils/BasicFuncs.js';

vi.mock('../src/renderer/src/utils/RendererImageLoader.js', () => ({
  loadRendererImage: async () => ({ src: 'prepared', naturalWidth: 100, naturalHeight: 100 }),
}));

const paths = ['C:/images/one.png', 'C:/images/two.png'];
const settle = () => new Promise(resolve => setImmediate(resolve));

function createWorkspace() {
  let active = true;
  const workflowState = ref(createWorkflowState());
  const presentImageSession = vi.fn(() => true);
  const recordImage = vi.fn();
  const recordDatasetTarget = vi.fn();
  const outputMessage = vi.fn();
  const getWorkspaceSession = vi.fn(async () => ({
    success: true,
    session: { datasetPath: 'C:/datasets/sample.json', imagePath: paths[1], imageIndex: 1 },
  }));
  const prepareImage = vi.fn(async request => ({
    requestId: request.requestId,
    success: true,
    imageInfo: {
      url: 'prepared',
      path: request.imagePath,
      fileName: 'test.png',
      originalWidth: 100,
      originalHeight: 100,
      displayWidth: 100,
      displayHeight: 100,
      coordinateScaleX: 1,
      coordinateScaleY: 1,
    },
  }));
  const readDataset = vi.fn(async request =>
    createJsonResponse(
      paths.map(path => createPicture('DBR', path)),
      {
        requestId: request.requestId,
        path: request.filePath || 'C:/datasets/sample.json',
      },
    ),
  );
  const invoke = vi.fn(async (channel, request) => {
    if (channel === 'read-json-file' || channel === 'open-json-file-dialog' || channel === 'open-adjacent-json-file')
      return readDataset(request);
    if (channel === 'resolve-json-image-paths') return { success: true, imagePaths: paths };
    if (channel === 'prepare-image' || channel === 'open-image-file-dialog') return prepareImage(request);
    throw new Error(`Unexpected channel: ${channel}`);
  });
  const shared = { workflowState, invoke, isActive: () => active, outputMessage };
  const images = useWorkspaceImages({
    ...shared,
    presentImageSession,
    recordImage,
    resetDots: vi.fn(),
    resetZoomPreview: vi.fn(),
    refreshCurrentAnnotations: vi.fn(),
    clearCurrentAnnotations: vi.fn(),
    synchronizeQuadFocusSelection: vi.fn(),
  });
  const dataset = useWorkspaceDataset({
    ...shared,
    getWorkspaceSession,
    recordDatasetTarget,
    confirmLossyRepair: () => true,
    saveJsonFile: async () => true,
    onDatasetReset: images.resetForDatasetChange,
    startDatasetImageRequest: images.startDatasetImageRequest,
    showDatasetPanel: vi.fn(),
    showAnnotationPanel: vi.fn(),
  });
  return {
    images,
    dataset,
    workflowState,
    invoke,
    readDataset,
    prepareImage,
    getWorkspaceSession,
    presentImageSession,
    recordImage,
    recordDatasetTarget,
    dispose() {
      active = false;
      images.dispose();
    },
  };
}

afterEach(() => vi.restoreAllMocks());

describe('Workspace loading controllers without a mounted page', () => {
  it('restores the checkpoint image and records only a matched ready session', async () => {
    const workspace = createWorkspace();
    await workspace.dataset.restoreWorkspaceSession();
    await settle();

    expect(workspace.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
    expect(workspace.images.imageSession.value).toMatchObject({ path: paths[1], imageIndex: 1 });
    expect(getCurrentJsonImageIndex()).toBe(1);
    expect(workspace.recordDatasetTarget).toHaveBeenCalledExactlyOnceWith('C:/datasets/sample.json');
    expect(workspace.recordImage).toHaveBeenCalledExactlyOnceWith({
      datasetPath: 'C:/datasets/sample.json',
      imagePath: paths[1],
      imageIndex: 1,
    });
    expect(workspace.presentImageSession.mock.invocationCallOrder.at(-1)).toBeLessThan(
      workspace.recordImage.mock.invocationCallOrder[0],
    );
  });

  it('preserves the loaded session when either file dialog is canceled', async () => {
    const workspace = createWorkspace();
    await workspace.dataset.restoreWorkspaceSession();
    await settle();
    const session = workspace.images.imageSession.value;
    const data = getJsonFileInfo();
    workspace.readDataset.mockImplementationOnce(async request => createCanceledDatasetFileResponse(request.requestId));
    await workspace.dataset.chooseJsonFile();
    workspace.prepareImage.mockImplementationOnce(async request => ({ requestId: request.requestId, canceled: true }));
    workspace.images.chooseImgFile();
    await settle();

    expect(workspace.workflowState.value.phase).toBe(WORKFLOW_PHASE.READY);
    expect(workspace.images.imageSession.value).toBe(session);
    expect(getJsonFileInfo()).toEqual(data);
    expect(workspace.recordDatasetTarget).toHaveBeenCalledTimes(1);
    expect(workspace.recordImage).toHaveBeenCalledTimes(1);
  });

  it('keeps a failed selected dataset as the next navigation base', async () => {
    const workspace = createWorkspace();
    workspace.readDataset.mockImplementationOnce(async request => ({
      requestId: request.requestId,
      status: 'failed',
      target: { path: 'C:/datasets/broken.json', fileName: 'broken.json' },
      error: '无法读取测试图集。',
    }));
    await workspace.dataset.chooseJsonFile();
    expect(workspace.dataset.datasetLoadError.value).toEqual({
      path: 'C:/datasets/broken.json',
      message: '无法读取测试图集。',
    });
    expect(workspace.recordDatasetTarget).toHaveBeenCalledWith('C:/datasets/broken.json');
    expect(workspace.recordImage).not.toHaveBeenCalled();
    await workspace.dataset.changeDatasetByDirection(KEYS.NEXT);
    await settle();
    expect(workspace.invoke).toHaveBeenCalledWith(
      'open-adjacent-json-file',
      expect.objectContaining({
        currentFilePath: 'C:/datasets/broken.json',
        direction: KEYS.NEXT,
      }),
    );
  });

  it('ends a bounded retry sequence when every current image response is malformed', async () => {
    const workspace = createWorkspace();
    workspace.prepareImage.mockResolvedValue(null);
    await workspace.dataset.chooseJsonFile();
    await settle();

    expect(workspace.prepareImage).toHaveBeenCalledTimes(paths.length);
    expect(workspace.workflowState.value.phase).toBe(WORKFLOW_PHASE.DATASET_READY);
    expect(workspace.images.imageSession.value).toBeNull();
    expect(workspace.images.imageLoadError.value).not.toBeNull();
    expect(workspace.recordImage).not.toHaveBeenCalled();
  });

  it('does not read files when startup restoration finishes after disposal', async () => {
    const workspace = createWorkspace();
    let resolveSession;
    workspace.getWorkspaceSession.mockReturnValueOnce(
      new Promise(resolve => {
        resolveSession = resolve;
      }),
    );
    const loading = workspace.dataset.restoreWorkspaceSession();
    workspace.dispose();
    resolveSession({ success: true, session: { datasetPath: 'C:/datasets/late.json' } });
    await loading;

    expect(workspace.invoke).not.toHaveBeenCalled();
    expect(workspace.recordDatasetTarget).not.toHaveBeenCalled();
    expect(workspace.presentImageSession).not.toHaveBeenCalled();
  });

  it('does not present or checkpoint an image that finishes after disposal', async () => {
    const workspace = createWorkspace();
    let resolveImage;
    workspace.prepareImage.mockReturnValueOnce(
      new Promise(resolve => {
        resolveImage = resolve;
      }),
    );
    await workspace.dataset.chooseJsonFile();
    const request = workspace.prepareImage.mock.calls[0][0];
    workspace.dispose();
    workspace.presentImageSession.mockClear();
    resolveImage({ requestId: request.requestId, success: false, error: 'late error' });
    await settle();

    expect(workspace.images.imageSession.value).toBeNull();
    expect(workspace.presentImageSession).not.toHaveBeenCalled();
    expect(workspace.recordImage).not.toHaveBeenCalled();
  });
});

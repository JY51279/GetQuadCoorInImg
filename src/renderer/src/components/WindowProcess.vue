<template>
  <div class="workspace-shell">
    <TransitionGroup name="toast" tag="div" class="toast-container" aria-live="polite" aria-atomic="false">
      <div v-for="notification in notifications" :key="notification.id" class="toast-message">
        {{ notification.message }}
      </div>
    </TransitionGroup>

    <WorkspaceToolbar
      v-model:jump-image-index="jumpImageIndex"
      :can-load-dataset="canLoadDataset"
      :can-navigate-dataset="canNavigateDataset"
      :can-load-image="canLoadImage"
      :image-position-view="imagePositionView"
      :json-file-name="jsonFileName"
      @open-dataset="chooseJsonFile"
      @navigate-dataset="changeDatasetByDirection"
      @match-image="chooseImgFile"
      @navigate-image="changeImageByArrowKeys"
      @jump-image="jumpToImageIndex"
    />

    <main class="workspace-main">
      <ImageView
        ref="imgContainerRef"
        :can-edit="canOperate"
        :can-interact="canInteractWithImage"
        :is-loading="isImageLoading"
        :active-quad-index="activeQuadIndex"
        :selected-dots="selectedDots"
        :image-load-error="imageLoadError"
        :quad-interaction-capabilities="quadInteractionCapabilities"
        :display-pixel-ratio="displayPixelRatio"
        @update-zoom-view="updateZoomView"
        @output-message="outputMessage"
        @update-selected-dots="updateSelectedDots"
        @select-quad-index="selectQuadIndex"
        @commit-quad-point-drag="commitQuadPointDrag"
        @quad-translation-start="lockQuadSelectionForTranslation"
        @quad-translation-cancel="unlockQuadSelectionForTranslation"
        @commit-quad-translation="commitQuadTranslation"
      ></ImageView>

      <aside class="inspector-shell">
        <nav class="inspector-navigation" aria-label="功能分区">
          <div class="inspector-navigation-main">
            <button
              v-for="page in inspectorPages"
              :key="page.id"
              class="inspector-tab"
              :class="{ active: activeInspectorPage === page.id }"
              :title="page.shortcut ? `${page.label}（${page.shortcut}）` : page.label"
              :aria-label="page.label"
              :aria-pressed="activeInspectorPage === page.id"
              @click="selectInspectorPage(page.id)"
            >
              <span class="inspector-tab-icon" aria-hidden="true">{{ page.icon }}</span>
              <span>{{ page.label }}</span>
            </button>
          </div>
          <button
            class="inspector-tab help-tab"
            :class="{ active: activeInspectorPage === INSPECTOR_PAGE.HELP }"
            title="快捷键帮助（F1）"
            aria-label="帮助"
            :aria-pressed="activeInspectorPage === INSPECTOR_PAGE.HELP"
            @click="selectInspectorPage(INSPECTOR_PAGE.HELP)"
          >
            <span class="inspector-tab-icon" aria-hidden="true">?</span>
            <span>快捷键</span>
          </button>
        </nav>

        <div class="inspector-content">
          <QuadAnnotationPanel
            v-show="activeInspectorPage === INSPECTOR_PAGE.ANNOTATION"
            ref="quadAnnotationPanelRef"
            v-model:quad-location-propagation-count="quadLocationPropagationCount"
            :active-quad-index="activeQuadIndex"
            :active-quad-label="activeQuadLabel"
            :annotation-view="annotationView"
            :selected-dots="selectedDots"
            :is-quad-focus-mode-enabled="isQuadFocusModeEnabled"
            :can-interact-with-image="canInteractWithImage"
            :can-undo-points="canUndoPoints"
            :can-redo-points="canRedoPoints"
            :can-apply-quad-location-forward="canApplyQuadLocationForward"
            :is-quad-location-propagation-open="isQuadLocationPropagationOpen"
            :effective-propagation-count="effectiveQuadLocationPropagationCount"
            :remaining-following-image-count="remainingFollowingImageCount"
            :can-submit-location-propagation="canSubmitQuadLocationPropagation"
            :can-undo-json="canUndoJson"
            :can-redo-json="canRedoJson"
            :can-copy-previous-quad-location="canCopyPreviousQuadLocation"
            :can-operate="canOperate"
            @toggle-focus-mode="toggleQuadFocusMode"
            @undo-point="undoPointEdit"
            @redo-point="redoPointEdit"
            @toggle-location-propagation="toggleQuadLocationPropagation"
            @close-location-propagation="closeQuadLocationPropagation"
            @apply-location-forward="applyQuadLocationForward"
            @select-quad-index="selectQuadIndex"
            @undo-json="undoJsonEdit"
            @redo-json="redoJsonEdit"
            @copy-previous-location="copyPreviousQuadLocation"
            @modify-quad="modifyJsonItem"
            @add-quad="addJsonItem"
            @delete-quad="deleteJsonItem"
          />

          <ImageAnnotationPanel
            v-show="activeInspectorPage === INSPECTOR_PAGE.IMAGE_ANNOTATION"
            ref="imageAnnotationPanelRef"
            v-model="imageAnnotationInput"
            :status="imageAnnotationStatus"
            :error="imageAnnotationError"
            :load-error="imageAnnotationLoadError"
            :loading="imageAnnotationsLoading"
            :can-input="canInputImageAnnotation"
            :can-submit="canSubmitImageAnnotation"
            :feedback="imageAnnotationFeedback"
            :can-respond="canRespondImageAnnotation"
            :can-submit-feedback="canSubmitImageAnnotationFeedback"
            :can-restart-feedback="canRestartImageAnnotationFeedback"
            :image-number="currentImageAnnotation ? currentImageAnnotation.imageIndex + 1 : 0"
            :image-name="imgFileName"
            :saved="currentImageAnnotation?.saved ?? null"
            :can-prepare-images="canPrepareAnnotationImages"
            :preparing-images="preparingAnnotationImages"
            :image-regions="annotationImageRegions"
            :image-input-error="annotationImageInputError"
            :can-submit-images="canSubmitPreparedAnnotationImages"
            @submit="submitImageAnnotation"
            @prepare-images="prepareCurrentAnnotationImages"
            @submit-images="submitPreparedAnnotationImages"
            @feedback-option="setImageAnnotationFeedbackOption($event.questionId, $event.optionId, $event.checked)"
            @feedback-text="setImageAnnotationFeedbackText($event.questionId, $event.text)"
            @feedback-clear-options="clearImageAnnotationFeedbackOptions"
            @feedback-message="setImageAnnotationFeedbackMessage"
            @submit-feedback="submitImageAnnotationFeedback"
            @restart-feedback="restartImageAnnotationFeedback"
            @reload="reloadImageAnnotations"
          />

          <DatasetInfoPanel
            v-show="activeInspectorPage === INSPECTOR_PAGE.DATASET"
            :dataset-load-error="datasetLoadError"
            :loaded-product-type="loadedProductType"
            :json-file-name="jsonFileName"
            :img-file-name="imgFileName"
          />

          <DisplaySettingsPanel
            v-show="activeInspectorPage === INSPECTOR_PAGE.DISPLAY"
            :is-direct-quad-editing-enabled="isDirectQuadEditingEnabled"
            :can-interact-with-image="canInteractWithImage"
            :can-focus-quad="canFocusQuad"
            :has-quads="quadTotal > 0"
            @toggle-quad-interaction="toggleQuadInteraction"
            @reset-position="resetPosition"
            @toggle-active-quad-visibility="toggleHighlight2ShowQuads"
            @show-all-quads="addAll2ShowQuads"
            @hide-all-quads="clearShowQuads"
          />

          <section v-show="activeInspectorPage === INSPECTOR_PAGE.HISTORY" class="inspector-page history-page">
            <header class="panel-header">
              <h2>JSON 操作历史</h2>
            </header>
            <p class="history-page-note">
              点击当前图片的记录可回到对应状态；其他图片只读。每图最多
              {{ jsonHistoryLimits.perImage }} 条，图集最多 {{ jsonHistoryLimits.total }} 条。
            </p>
            <HistoryView :groups="jsonHistoryGroups" @jump-history="jumpJsonHistory" />
          </section>

          <Help
            v-show="activeInspectorPage === INSPECTOR_PAGE.HELP"
            class="inspector-page"
            :groups="shortcutHelpGroups"
          />
        </div>
      </aside>
    </main>

    <footer class="workspace-statusbar">
      <div class="status-context">
        <span class="status-item"><i :class="['status-dot', workflowState.phase]"></i>{{ workflowStatusText }}</span>
        <span class="status-divider"></span>
        <div class="mode-status-lights" aria-label="当前画布模式">
          <span
            class="mode-status-light direct-edit"
            :class="{ active: isDirectQuadEditingEnabled }"
            :title="isDirectQuadEditingEnabled ? 'Tab 直接编辑模式已开启' : '当前为默认观察模式'"
          >
            <i aria-hidden="true"></i><kbd>Tab</kbd>{{ isDirectQuadEditingEnabled ? '编辑' : '默认' }}
          </span>
          <span
            class="mode-status-light quad-focus"
            :class="{ active: isQuadFocusModeEnabled }"
            :title="isQuadFocusModeEnabled ? 'F 自动聚焦模式已开启' : '当前为自由视图'"
          >
            <i aria-hidden="true"></i><kbd>F</kbd>{{ isQuadFocusModeEnabled ? '聚焦' : '自由' }}
          </span>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useWorkspaceImages } from '../composables/useWorkspaceImages.js';
import { useWorkspaceDataset } from '../composables/useWorkspaceDataset.js';
import { useDevicePixelRatio } from '@vueuse/core';
import ImageView from './ImageView.vue';
import WorkspaceToolbar from './WorkspaceToolbar.vue';
import DatasetInfoPanel from './DatasetInfoPanel.vue';
import ImageAnnotationPanel from './ImageAnnotationPanel.vue';
import QuadAnnotationPanel from './QuadAnnotationPanel.vue';
import DisplaySettingsPanel from './DisplaySettingsPanel.vue';
import { useImageAnnotations } from '../composables/useImageAnnotations.js';
import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';
import Help from './Help.vue';
import HistoryView from './HistoryView.vue';
import { useWorkspaceEditing } from '../composables/useWorkspaceEditing.js';
import { usePointSelectionHistory } from '../composables/usePointSelectionHistory.js';
import { useToastNotifications } from '../composables/useToastNotifications.js';
import { useAnnotationImagePreparation } from '../composables/useAnnotationImagePreparation.js';
import { useWorkspaceQuadSelection } from '../composables/useWorkspaceQuadSelection.js';
import { useZoomPreview } from '../composables/useZoomPreview.js';
import { getCurrentAnnotationView, getCurrentImageQuadSnapshot, getJsonFileInfo } from '../state/DatasetState.js';
import { createJsonFileService } from '../services/JsonFileService.js';
import {
  createWorkspaceSessionService,
  observeWorkspaceRecord as reportWorkspaceSessionRecord,
} from '../services/WorkspaceSessionService.js';
import { KEYS } from '../utils/BasicFuncs.js';
import { normalizeDevicePixelRatio } from '../utils/CanvasDisplay.js';
import { createShortcutHelpGroups, dispatchShortcut } from '../utils/KeyboardShortcuts.js';
import { WORKSPACE_SHORTCUT_HELP_GROUPS, createWorkspaceShortcutCommands } from '../shortcuts/WorkspaceShortcuts.js';
import {
  QUAD_INTERACTION_MODE,
  getQuadInteractionCapabilities,
  isDirectQuadEditingMode,
  toggleQuadInteractionMode,
} from '../state/QuadInteractionMode.js';
import {
  WORKFLOW_OPERATION,
  WORKFLOW_PHASE,
  canEdit as canEditWorkflow,
  canStartOperation,
  createWorkflowState,
  isWorkflowBusy,
} from '../state/WorkflowState.js';

let disposed = false;
const ipcRenderer = window.electron.ipcRenderer;
const { save: saveJsonFileRequest } = createJsonFileService({
  invoke: (channel, request) => ipcRenderer.invoke(channel, request),
});
const workspaceSessionService = createWorkspaceSessionService({
  invoke: (channel, request) => ipcRenderer.invoke(channel, request),
});

// Child component and canvas references
const imgContainerRef = ref(null);
const quadAnnotationPanelRef = ref(null);

const INSPECTOR_PAGE = Object.freeze({
  ANNOTATION: 'annotation',
  IMAGE_ANNOTATION: 'image-annotation',
  DATASET: 'dataset',
  DISPLAY: 'display',
  HISTORY: 'history',
  HELP: 'help',
});
const inspectorPages = Object.freeze([
  { id: INSPECTOR_PAGE.DATASET, label: '图集与图片', icon: '▤', shortcut: 'Ctrl+1' },
  { id: INSPECTOR_PAGE.ANNOTATION, label: 'Quad 标注', icon: '◇', shortcut: 'Ctrl+2' },
  { id: INSPECTOR_PAGE.IMAGE_ANNOTATION, label: '图片注解', icon: '✎', shortcut: 'F2' },
  { id: INSPECTOR_PAGE.DISPLAY, label: '视图与交互', icon: '◐', shortcut: 'Ctrl+3' },
  { id: INSPECTOR_PAGE.HISTORY, label: '操作历史', icon: '↶', shortcut: 'Ctrl+4' },
]);
const validInspectorPages = new Set([...inspectorPages.map(page => page.id), INSPECTOR_PAGE.HELP]);
const activeInspectorPage = ref(INSPECTOR_PAGE.DATASET);
let previousInspectorPage = INSPECTOR_PAGE.DATASET;

// Dataset and current image state
const annotationView = ref({ formattedItems: [], quads: [], errorMessage: '' });
const quadTotal = computed(() => annotationView.value.formattedItems.length);
const isQuadLocationPropagationOpen = ref(false);
const quadLocationPropagationCount = ref(0);
const quadInteractionMode = ref(QUAD_INTERACTION_MODE.DEFAULT);
const quadInteractionCapabilities = computed(() => getQuadInteractionCapabilities(quadInteractionMode.value));
const isDirectQuadEditingEnabled = computed(() => isDirectQuadEditingMode(quadInteractionMode.value));
const { pixelRatio: rawDisplayPixelRatio } = useDevicePixelRatio();
const displayPixelRatio = computed(() => normalizeDevicePixelRatio(rawDisplayPixelRatio.value));

// Operation and image request state
const workflowState = ref(createWorkflowState());
const { notifications, notify: outputMessage, dispose: disposeNotifications } = useToastNotifications();
const {
  imageSession,
  imagePositionView,
  jumpImageIndex,
  imageLoadError,
  hasCurrentImageSession,
  canLoadImage,
  isImageLoading,
  chooseImgFile: chooseImgFileInternal,
  changeImageByArrowKeys: changeImageByArrowKeysInternal,
  jumpToImageIndex: jumpToImageIndexInternal,
  startDatasetImageRequest,
  clearCurrentImage,
  resetForDatasetChange: resetImageSessionForDatasetChange,
  dispose: disposeImages,
} = useWorkspaceImages({
  workflowState,
  invoke: (channel, request) => ipcRenderer.invoke(channel, request),
  isActive: () => !disposed,
  outputMessage,
  recordImage: checkpoint => reportWorkspaceSessionRecord(workspaceSessionService.recordImage(checkpoint)),
  presentImageSession: session => imgContainerRef.value?.presentImageSession?.(session),
  resetDots: () => resetDots(),
  resetZoomPreview: () => resetZoomPreview(),
  refreshCurrentAnnotations,
  clearCurrentAnnotations,
  synchronizeQuadFocusSelection: options => synchronizeQuadFocusSelection(options),
});
const imageObj = computed(() => imageSession.value?.image ?? null);
const imgFileName = computed(() => imageSession.value?.fileName ?? '');
const imageAnnotationPanelRef = ref(null);
const imageCoordinateScale = computed(() => imageSession.value?.coordinateScale ?? { x: 1, y: 1 });
const currentImageOriginalSize = computed(() => imageSession.value?.originalSize ?? null);
const selectedDataset = computed(() => workflowState.value.datasetTarget ?? { path: '', fileName: '' });
const jsonFileName = computed(() => selectedDataset.value.fileName);
const workflowBusy = computed(() => isWorkflowBusy(workflowState.value));
const canOperate = computed(
  () =>
    canEditWorkflow(workflowState.value) &&
    hasCurrentImageSession.value &&
    imageSession.value.imageIndex >= 0 &&
    imageSession.value.imageIndex === imagePositionView.value.currentIndex,
);
const {
  preparing: preparingAnnotationImages,
  regions: annotationImageRegions,
  error: annotationImageInputError,
  canPrepare: canPrepareAnnotationImages,
  canSubmit: canSubmitPreparedAnnotationImages,
  prepare: prepareCurrentAnnotationImages,
  submit: submitPreparedAnnotationImages,
  isSnapshotCurrent: isPreparedVisualSnapshotCurrent,
  dispose: disposeAnnotationImagePreparation,
} = useAnnotationImagePreparation({
  canStart: () => canOperate.value && !imageAnnotationsBusy.value && !imageAnnotationFeedback.value,
  getImagePath: () => imageSession.value?.path ?? '',
  getQuadSnapshot: getCurrentImageQuadSnapshot,
  getQuadSignature: () => JSON.stringify(annotationView.value.quads),
  prepareImages: request => ipcRenderer.invoke(IPC_CHANNELS.PREPARE_ANNOTATION_IMAGES, request),
  submitVisual: visualInput => submitVisualImageAnnotation(visualInput),
});
const {
  loadedProductType,
  datasetLoadError,
  restoreWorkspaceSession,
  chooseJsonFile: chooseJsonFileInternal,
  changeDatasetByDirection: changeDatasetByDirectionInternal,
} = useWorkspaceDataset({
  workflowState,
  invoke: (channel, request) => ipcRenderer.invoke(channel, request),
  isActive: () => !disposed,
  outputMessage,
  saveJsonFile: saveJsonFileRequest,
  confirmLossyRepair: message => window.confirm(message),
  getWorkspaceSession: () => workspaceSessionService.get(),
  recordDatasetTarget: path => reportWorkspaceSessionRecord(workspaceSessionService.recordDatasetTarget(path)),
  onDatasetReset: resetWorkspaceForDatasetChange,
  onDatasetLoaded: openImageAnnotations,
  startDatasetImageRequest,
  showDatasetPanel: () => selectInspectorPage(INSPECTOR_PAGE.DATASET),
  showAnnotationPanel: () => selectInspectorPage(INSPECTOR_PAGE.ANNOTATION),
});

const imageAnnotationIndex = computed(() =>
  hasCurrentImageSession.value && imageSession.value.imageIndex === imagePositionView.value.currentIndex
    ? imageSession.value.imageIndex
    : -1,
);
const {
  current: currentImageAnnotation,
  input: imageAnnotationInput,
  status: imageAnnotationStatus,
  error: imageAnnotationError,
  loadError: imageAnnotationLoadError,
  loading: imageAnnotationsLoading,
  canInput: canInputImageAnnotation,
  canSubmit: canSubmitImageAnnotation,
  feedback: imageAnnotationFeedback,
  canRespond: canRespondImageAnnotation,
  canSubmitFeedback: canSubmitImageAnnotationFeedback,
  canRestartFeedback: canRestartImageAnnotationFeedback,
  hasPending: hasPendingImageAnnotations,
  busy: imageAnnotationsBusy,
  open: openImageAnnotationDataset,
  clear: clearImageAnnotations,
  reload: reloadImageAnnotations,
  submit: submitImageAnnotation,
  submitVisual: submitVisualImageAnnotation,
  setFeedbackOption: setImageAnnotationFeedbackOption,
  setFeedbackText: setImageAnnotationFeedbackText,
  clearFeedbackOptions: clearImageAnnotationFeedbackOptions,
  setFeedbackMessage: setImageAnnotationFeedbackMessage,
  submitFeedback: submitImageAnnotationFeedback,
  restartFeedback: restartImageAnnotationFeedback,
  dispose: disposeImageAnnotations,
} = useImageAnnotations({
  imageIndex: imageAnnotationIndex,
  canEdit: canOperate,
  invoke: (channel, request) => ipcRenderer.invoke(channel, request),
  notify: outputMessage,
  subscribeProgress: listener =>
    ipcRenderer.on?.(IPC_CHANNELS.ANNOTATION_PROGRESS, (_event, progress) => listener(progress)),
  isVisualSessionCurrent: snapshot => isPreparedVisualSnapshotCurrent(snapshot),
});

function chooseImgFile() {
  return chooseImgFileInternal();
}
function changeImageByArrowKeys(direction) {
  return changeImageByArrowKeysInternal(direction);
}
function jumpToImageIndex() {
  return jumpToImageIndexInternal();
}
function chooseJsonFile() {
  if (!canLoadDataset.value) return;
  return chooseJsonFileInternal();
}
function changeDatasetByDirection(direction) {
  if (!canNavigateDataset.value) return;
  return changeDatasetByDirectionInternal(direction);
}
function guardAnnotationUnload(event) {
  if (hasPendingImageAnnotations.value) {
    event.preventDefault();
    event.returnValue = '';
  }
}
const {
  selectedDots,
  canUndo: canUndoPoints,
  canRedo: canRedoPoints,
  updateFromChild: updateSelectedDots,
  removePoint: clearOneDot,
  undo: undoPointEdit,
  redo: redoPointEdit,
  clear: clearDots,
  reset: resetDots,
} = usePointSelectionHistory({ canEdit: canOperate });
const {
  update: updateZoomView,
  reset: resetZoomPreview,
  syncCanvasPixelRatio: syncZoomCanvasPixelRatio,
  dispose: disposeZoomPreview,
} = useZoomPreview({
  getCanvas: () => quadAnnotationPanelRef.value?.getZoomCanvas?.() ?? null,
  pixelRatio: displayPixelRatio,
  image: imageObj,
  points: selectedDots,
});
const canLoadDataset = computed(
  () => canStartOperation(workflowState.value, WORKFLOW_OPERATION.LOAD_DATASET) && !imageAnnotationsBusy.value,
);
const canNavigateDataset = computed(() => canLoadDataset.value && Boolean(selectedDataset.value.path));
const canInteractWithImage = computed(
  () =>
    !workflowBusy.value &&
    hasCurrentImageSession.value &&
    [WORKFLOW_PHASE.READY, WORKFLOW_PHASE.DATASET_READY].includes(workflowState.value.phase),
);
const {
  activeQuadIndex,
  selectionLockIndex: quadSelectionLockIndex,
  isSelectionLocked: isQuadSelectionLocked,
  isFocusModeEnabled: isQuadFocusModeEnabled,
  canFocus: canFocusQuad,
  activeLabel: activeQuadLabel,
  select: selectQuadIndex,
  reset: resetQuadSelection,
  lockForTranslation: lockQuadSelectionForTranslation,
  unlockForTranslation: unlockQuadSelectionForTranslation,
  selectAdjacent: changeJsonItemSelection,
  synchronizeFocus: synchronizeQuadFocusSelection,
  toggleFocusMode: toggleQuadFocusMode,
  resetForDatasetChange: resetQuadFocusForDatasetChange,
  dispose: disposeQuadSelection,
} = useWorkspaceQuadSelection({
  workflowState,
  quadTotal,
  canOperate: () => canOperate.value,
  canInteract: () => canInteractWithImage.value,
  focusQuad: quadIndex => imgContainerRef.value?.focusQuad(quadIndex),
  cancelTranslation: reason => imgContainerRef.value?.cancelQuadTranslation?.(reason),
  outputMessage,
  isActive: () => !disposed,
});
const canCopyPreviousQuadLocation = computed(
  () =>
    canOperate.value &&
    activeQuadIndex.value >= 0 &&
    activeQuadIndex.value < quadTotal.value &&
    imagePositionView.value.currentIndex > 0 &&
    currentImageOriginalSize.value !== null,
);
const remainingFollowingImageCount = computed(() =>
  Math.max(0, imagePositionView.value.total - imagePositionView.value.currentIndex - 1),
);
const canApplyQuadLocationForward = computed(
  () =>
    canOperate.value &&
    activeQuadIndex.value >= 0 &&
    activeQuadIndex.value < quadTotal.value &&
    remainingFollowingImageCount.value > 0,
);
const isQuadLocationPropagationCountValid = computed(
  () => Number.isInteger(quadLocationPropagationCount.value) && quadLocationPropagationCount.value > 0,
);
const effectiveQuadLocationPropagationCount = computed(() =>
  isQuadLocationPropagationCountValid.value
    ? Math.min(quadLocationPropagationCount.value, remainingFollowingImageCount.value)
    : 0,
);
const canSubmitQuadLocationPropagation = computed(
  () => canApplyQuadLocationForward.value && isQuadLocationPropagationCountValid.value,
);
const workflowStatusText = computed(() => {
  const labels = {
    [WORKFLOW_PHASE.EMPTY]: '等待打开图集',
    [WORKFLOW_PHASE.DATASET_ERROR]: '图集加载失败',
    [WORKFLOW_PHASE.DATASET_READY]: '图集已加载',
    [WORKFLOW_PHASE.RECOVERY_REQUIRED]: '需要重新加载图集',
    [WORKFLOW_PHASE.READY]: '可以编辑',
    [WORKFLOW_PHASE.LOADING_DATASET]: '正在打开图集…',
    [WORKFLOW_PHASE.LOADING_IMAGE]: '正在加载图片…',
    [WORKFLOW_PHASE.SAVING]: '正在保存…',
  };
  return labels[workflowState.value.phase] ?? '未知状态';
});
// Editing and history orchestration
const {
  jsonHistoryLimits,
  canUndoJson,
  canRedoJson,
  jsonHistoryGroups,
  clearJsonHistory,
  commitQuadPointDrag,
  commitQuadTranslation,
  addJsonItem,
  deleteJsonItem,
  modifyJsonItem,
  undoJsonEdit,
  redoJsonEdit,
  jumpJsonHistory,
  copyPreviousQuadLocation,
  applyQuadLocationForward,
} = useWorkspaceEditing({
  workflowState,
  canOperate,
  activeQuadIndex,
  quadSelectionLockIndex,
  quadTotal,
  imagePositionView,
  imageCoordinateScale,
  currentImageOriginalSize,
  selectedDots,
  canApplyQuadLocationForward,
  quadLocationPropagationCount,
  isActive: () => !disposed,
  saveJsonFile: () => saveJsonFileRequest(getJsonFileInfo()),
  outputMessage,
  refreshCurrentAnnotations,
  clearCurrentAnnotations,
  clearCurrentImage,
  selectQuadIndex,
  unlockQuadSelectionForTranslation,
  resetDots,
  closeQuadLocationPropagation,
  onAnnotationAdded: () =>
    nextTick(() => {
      if (!disposed) quadAnnotationPanelRef.value?.scrollToBottom();
    }),
});

function selectInspectorPage(pageId) {
  if (!validInspectorPages.has(pageId)) return;
  if (pageId === INSPECTOR_PAGE.HELP && activeInspectorPage.value === INSPECTOR_PAGE.HELP) {
    activeInspectorPage.value = previousInspectorPage;
    return;
  }
  if (pageId !== INSPECTOR_PAGE.HELP) previousInspectorPage = pageId;
  activeInspectorPage.value = pageId;
}

function startImageAnnotation() {
  selectInspectorPage(INSPECTOR_PAGE.IMAGE_ANNOTATION);
  void nextTick(() => {
    if (
      disposed ||
      activeInspectorPage.value !== INSPECTOR_PAGE.IMAGE_ANNOTATION ||
      (!canInputImageAnnotation.value && !canRespondImageAnnotation.value)
    )
      return;
    imageAnnotationPanelRef.value?.focusInput?.();
  });
}

onMounted(() => {
  syncZoomCanvasPixelRatio();
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('beforeunload', guardAnnotationUnload);
  void restoreWorkspaceSession();
});

onUnmounted(() => {
  disposed = true;
  disposeImages();
  disposeImageAnnotations();
  disposeAnnotationImagePreparation();
  disposeQuadSelection();
  disposeZoomPreview();
  window.removeEventListener('beforeunload', guardAnnotationUnload);
  window.removeEventListener('keydown', handleKeyDown);
  disposeNotifications();
});

// Keyboard shortcuts
const shortcutCommands = createWorkspaceShortcutCommands({
  'inspector.dataset': () => selectInspectorPage(INSPECTOR_PAGE.DATASET),
  'inspector.annotation': () => selectInspectorPage(INSPECTOR_PAGE.ANNOTATION),
  'inspector.display': () => selectInspectorPage(INSPECTOR_PAGE.DISPLAY),
  'inspector.history': () => selectInspectorPage(INSPECTOR_PAGE.HISTORY),
  'image.annotation.edit': () => startImageAnnotation(),
  'quad.previous': () => changeJsonItemSelection(KEYS.PREVIOUS),
  'quad.next': () => changeJsonItemSelection(KEYS.NEXT),
  'image.previous': () => changeImageByArrowKeys(KEYS.PREVIOUS),
  'image.next': () => changeImageByArrowKeys(KEYS.NEXT),
  'dataset.previous': () => changeDatasetByDirection(KEYS.PREVIOUS),
  'dataset.next': () => changeDatasetByDirection(KEYS.NEXT),
  'quad.focus.toggle': () => toggleQuadFocusMode(),
  'image.zoom.in': () => zoomAtMouse(-1),
  'image.zoom.out': () => zoomAtMouse(1),
  'image.position.reset': () => resetPosition(),
  'dataset.open': () => chooseJsonFile(),
  'image.match': () => chooseImgFile(),
  'point.remove': ({ event }) => clearOneDot(Number(event.key) - 1),
  'quad.update': () => modifyJsonItem(),
  'quad.location.copy-previous': () => copyPreviousQuadLocation(),
  'quad.location.apply-forward': () => applyQuadLocationForward(),
  'quad.add': () => addJsonItem(),
  'quad.delete': () => deleteJsonItem(),
  'point.clear': () => clearDots(),
  'point.undo': () => undoPointEdit(),
  'point.redo': () => redoPointEdit(),
  'json.undo': () => undoJsonEdit(),
  'json.redo': () => redoJsonEdit(),
  'quad.visibility.toggle': () => toggleHighlight2ShowQuads(),
  'quad.visibility.hide-all': () => clearShowQuads(),
  'quad.visibility.show-all': () => addAll2ShowQuads(),
  'quad.interaction.toggle': () => toggleQuadInteraction(),
  'help.toggle': () => selectInspectorPage(INSPECTOR_PAGE.HELP),
  'help.close': () => selectInspectorPage(previousInspectorPage),
});
const shortcutHelpGroups = Object.freeze(createShortcutHelpGroups(shortcutCommands, WORKSPACE_SHORTCUT_HELP_GROUPS));

function handleKeyDown(e) {
  if (isQuadSelectionLocked.value) {
    e.preventDefault();
    return;
  }
  dispatchShortcut(e, shortcutCommands, {
    isHelpOpen: activeInspectorPage.value === INSPECTOR_PAGE.HELP,
  });
}

// Child component commands
function resetPosition() {
  if (!canInteractWithImage.value) return;
  imgContainerRef.value?.resetPosition();
}

function zoomAtMouse(deltaY) {
  const result = imgContainerRef.value?.zoomAtMouse(deltaY);
  if (!result?.success) outputMessage(result?.error || '无法缩放图片。');
}

function closeQuadLocationPropagation() {
  isQuadLocationPropagationOpen.value = false;
}

function toggleQuadLocationPropagation() {
  if (!canApplyQuadLocationForward.value) return;
  if (isQuadLocationPropagationOpen.value) {
    closeQuadLocationPropagation();
    return;
  }

  if (quadLocationPropagationCount.value === 0) {
    quadLocationPropagationCount.value = remainingFollowingImageCount.value;
  }
  isQuadLocationPropagationOpen.value = true;
}

function renderAnnotationQuads({
  resetVisibility = false,
  deletedQuadIndex = null,
  insertedQuadIndex = null,
  indexMutations = [],
  showNewQuad = false,
  showQuadIndex = null,
  redrawOverlay = false,
} = {}) {
  if (typeof imgContainerRef.value?.resetQuadsArray !== 'function') return;
  imgContainerRef.value.resetQuadsArray(annotationView.value.quads, imageCoordinateScale.value, {
    deletedIndex: deletedQuadIndex,
    insertedIndex: insertedQuadIndex,
    indexMutations,
  });
  if (resetVisibility) {
    clearShowQuads();
    addAll2ShowQuads();
  } else if (showNewQuad && quadTotal.value > 0) {
    imgContainerRef.value.addShowQuadIndex(quadTotal.value - 1);
  } else if (Number.isInteger(showQuadIndex)) {
    imgContainerRef.value.addShowQuadIndex(showQuadIndex);
  } else if (redrawOverlay) {
    imgContainerRef.value.redrawQuadOverlay();
  }
}

function refreshCurrentAnnotations(options = {}) {
  if (disposed) return;
  if (options.resetSelection) resetQuadSelection();
  annotationView.value = { ...getCurrentAnnotationView(), errorMessage: '' };
  renderAnnotationQuads(options);
}

function clearCurrentAnnotations(errorMessage = '') {
  resetQuadSelection();
  annotationView.value = { formattedItems: [], quads: [], errorMessage };
  renderAnnotationQuads({ resetVisibility: true });
}
function openImageAnnotations(context) {
  void openImageAnnotationDataset(context);
}

function resetWorkspaceForDatasetChange() {
  clearImageAnnotations();
  resetQuadFocusForDatasetChange();
  clearJsonHistory();
  resetImageSessionForDatasetChange();
  quadLocationPropagationCount.value = imagePositionView.value.total;
}

watch([() => imagePositionView.value.currentIndex, activeQuadIndex], closeQuadLocationPropagation);
watch(activeInspectorPage, page => {
  if (page !== INSPECTOR_PAGE.ANNOTATION) closeQuadLocationPropagation();
});
watch(canApplyQuadLocationForward, enabled => {
  if (!enabled) closeQuadLocationPropagation();
});

// Show quad
function toggleHighlight2ShowQuads() {
  if (canFocusQuad.value) imgContainerRef.value?.toggleShowQuadIndex(activeQuadIndex.value);
}
function addAll2ShowQuads() {
  for (let i = 0; i < quadTotal.value; ++i) {
    imgContainerRef.value?.addShowQuadIndex(i);
  }
}

function clearShowQuads() {
  imgContainerRef.value?.clearShowQuadIndex();
}

function toggleQuadInteraction() {
  if (!canInteractWithImage.value) return;
  quadInteractionMode.value = toggleQuadInteractionMode(quadInteractionMode.value);
  outputMessage(isDirectQuadEditingEnabled.value ? '已进入 Tab 直接编辑模式。' : '已返回默认模式。');
}
</script>

<style scoped src="../assets/workspace-controls.css"></style>
<style scoped>
* {
  user-select: none;
}
.workspace-shell {
  --accent: #2f6fed;
  --accent-strong: #245bc4;
  --accent-soft: #eaf1ff;
  --danger: #c63e45;
  --danger-soft: #fff0f0;
  --text-primary: #1c2430;
  --text-secondary: #5b6675;
  --text-muted: #8a94a3;
  --surface-app: #eef1f5;
  --surface-raised: #ffffff;
  --surface-muted: #f7f8fa;
  --surface-hover: #edf1f7;
  --border-subtle: #dce1e8;
  --border-strong: #c7ced8;
  --font-ui: 'Segoe UI', 'Microsoft YaHei UI', sans-serif;
  --font-mono: 'Cascadia Mono', 'Consolas', monospace;
  --font-size-body: 13px;
  --font-size-secondary: 12px;
  --font-size-caption: 11px;
  --font-size-code: 12px;
  --font-size-key: 10px;
  display: grid;
  grid-template-rows: 60px minmax(0, 1fr) 34px;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--surface-app);
  color: var(--text-primary);
  font-family: var(--font-ui);
}

.workspace-main {
  display: grid;
  grid-template-columns: minmax(360px, 1fr) clamp(360px, 34vw, 470px);
  gap: 12px;
  min-width: 0;
  min-height: 0;
  padding: 12px;
}

.inspector-shell {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
  background: var(--surface-raised);
  box-shadow: 0 5px 18px rgba(37, 48, 65, 0.06);
}

.inspector-navigation {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 8px 6px;
  border-right: 1px solid var(--border-subtle);
  background: var(--surface-muted);
}

.inspector-navigation-main {
  display: grid;
  gap: 5px;
}

.inspector-tab {
  display: grid;
  gap: 3px;
  place-items: center;
  min-height: 56px;
  padding: 5px 2px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  font: 600 var(--font-size-caption) / 1.2 var(--font-ui);
  cursor: pointer;
}

.inspector-tab > span:not(.inspector-tab-icon) {
  max-width: 72px;
  line-height: 1.25;
}

.inspector-tab:hover {
  background: var(--surface-hover);
  color: var(--text-secondary);
}

.inspector-tab.active {
  background: var(--accent-soft);
  color: var(--accent-strong);
}

.inspector-tab-icon {
  font-size: 18px;
  line-height: 1;
}

.help-tab {
  margin-top: auto;
}

.inspector-content {
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.inspector-page {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 18px;
  overflow-y: auto;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header {
  min-height: 42px;
}

.panel-header-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.panel-header h2 {
  margin: 0;
  font-size: 19px;
  line-height: 1.2;
}

.action-button {
  padding: 0 10px;
}

.history-page-note {
  margin: 12px 0;
  padding: 10px 11px;
  border-radius: 7px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: var(--font-size-secondary);
  line-height: 1.5;
}

.workspace-statusbar {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 0 14px;
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: var(--font-size-caption);
  white-space: nowrap;
}

.status-context {
  display: flex;
  gap: 9px;
  align-items: center;
}

.status-item {
  display: flex;
  gap: 6px;
  align-items: center;
}

.mode-status-lights,
.mode-status-light {
  display: inline-flex;
  align-items: center;
}

.mode-status-lights {
  gap: 9px;
}

.mode-status-light {
  gap: 4px;
  color: var(--text-muted);
  font-weight: 600;
  transition: color 140ms ease;
}

.mode-status-light > i {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #a8b0bc;
  box-shadow: 0 0 0 2px rgba(168, 176, 188, 0.14);
  transition:
    background 140ms ease,
    box-shadow 140ms ease;
}

.mode-status-light.direct-edit.active {
  color: #a94e08;
}

.mode-status-light.direct-edit.active > i {
  background: #d97706;
  box-shadow: 0 0 0 3px rgba(217, 119, 6, 0.16);
}

.mode-status-light.quad-focus.active {
  color: var(--accent-strong);
}

.mode-status-light.quad-focus.active > i {
  background: var(--accent);
  box-shadow: 0 0 0 3px rgba(47, 111, 237, 0.16);
}

.status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #9aa3af;
}

.status-dot.ready {
  background: #28a06b;
  box-shadow: 0 0 0 3px rgba(40, 160, 107, 0.12);
}

.status-dot.dataset-error {
  background: var(--danger);
  box-shadow: 0 0 0 3px rgba(196, 53, 58, 0.12);
}

.status-dot.loading-dataset,
.status-dot.loading-image,
.status-dot.saving {
  background: #e4a72c;
}

.status-divider {
  width: 1px;
  height: 11px;
  background: var(--border-subtle);
}

:deep(kbd) {
  display: inline-grid;
  min-width: 19px;
  min-height: 18px;
  place-items: center;
  padding: 1px 5px;
  border: 1px solid var(--border-strong);
  border-bottom-width: 2px;
  border-radius: 4px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font: 600 var(--font-size-key) / 1 var(--font-ui);
  vertical-align: middle;
}

.toast-container {
  position: fixed;
  top: 80px;
  right: 20px;
  z-index: 10000;
  display: flex;
  width: min(340px, calc(100vw - 40px));
  max-height: calc(100vh - 126px);
  flex-direction: column;
  gap: 7px;
  overflow: hidden;
  pointer-events: none;
}

.toast-message {
  flex: 0 0 auto;
  padding: 9px 13px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 7px;
  background: rgba(28, 36, 48, 0.94);
  color: white;
  font-size: var(--font-size-body);
  line-height: 1.4;
  overflow-wrap: anywhere;
  box-shadow: 0 6px 20px rgba(28, 36, 48, 0.24);
}

.toast-enter-active,
.toast-leave-active,
.toast-move {
  transition:
    opacity 160ms ease,
    transform 160ms ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(14px);
}

@media (max-width: 980px) {
  .workspace-main {
    grid-template-columns: minmax(330px, 1fr) 360px;
  }
}
</style>

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
          <section v-show="activeInspectorPage === INSPECTOR_PAGE.ANNOTATION" class="inspector-page annotation-page">
            <header class="panel-header">
              <h2>Quad {{ activeQuadLabel }}</h2>
              <div class="panel-header-actions">
                <button
                  class="action-button"
                  :class="{ primary: isQuadFocusModeEnabled }"
                  :title="isQuadFocusModeEnabled ? '退出 Quad 聚焦模式（F）' : '进入 Quad 聚焦模式（F）'"
                  :disabled="!isQuadFocusModeEnabled && !canInteractWithImage"
                  :aria-pressed="isQuadFocusModeEnabled"
                  @click="toggleQuadFocusMode"
                >
                  {{ isQuadFocusModeEnabled ? '退出聚焦模式' : '进入聚焦模式' }}
                </button>
              </div>
            </header>

            <div class="precision-panel">
              <div class="section-heading">
                <span>像素预览</span>
                <small>鼠标所在位置</small>
              </div>
              <div class="precision-content">
                <div class="zoom-view-box">
                  <canvas ref="zoomView" class="zoom-style" width="120" height="120"></canvas>
                </div>
                <ol class="point-list">
                  <li v-for="index in 4" :key="index" :class="{ empty: !selectedDots[index - 1] }">
                    <span>P{{ index }}</span>
                    <code v-if="selectedDots[index - 1]">
                      {{ selectedDots[index - 1].x }}, {{ selectedDots[index - 1].y }}
                    </code>
                    <code v-else>—</code>
                  </li>
                </ol>
              </div>
              <div class="point-history-actions">
                <button
                  class="action-button history-button"
                  title="撤回选点（Ctrl+Z）"
                  :disabled="!canUndoPoints"
                  @click="undoPointEdit"
                >
                  撤回选点
                </button>
                <button
                  class="action-button history-button"
                  title="重做选点（Ctrl+Y）"
                  :disabled="!canRedoPoints"
                  @click="redoPointEdit"
                >
                  重做选点
                </button>
              </div>
            </div>

            <div class="annotation-list-section">
              <div class="annotation-list-heading section-heading">
                <span>标注数据</span>
                <button
                  type="button"
                  class="section-action-button"
                  :disabled="!canApplyQuadLocationForward"
                  :aria-expanded="isQuadLocationPropagationOpen"
                  aria-controls="quad-location-propagation-panel"
                  title="将当前 Quad 坐标应用到后续图片的同下标 Quad（Ctrl+Shift+E 直接应用）"
                  @click="toggleQuadLocationPropagation"
                >
                  应用到后续…
                </button>
              </div>
              <form
                v-if="isQuadLocationPropagationOpen"
                id="quad-location-propagation-panel"
                class="quad-location-propagation-panel"
                @submit.prevent="applyQuadLocationForward"
                @keydown.esc.stop.prevent="closeQuadLocationPropagation"
              >
                <div class="propagation-panel-heading">
                  <strong>应用 Quad {{ activeQuadIndex + 1 }} 的坐标</strong>
                  <span>仅复制 loc，不缩放</span>
                </div>
                <label class="propagation-field">
                  <span>批次张数</span>
                  <span class="propagation-count-control">
                    <input
                      v-model.number="quadLocationPropagationCount"
                      type="number"
                      min="1"
                      step="1"
                      :disabled="!canOperate"
                      aria-label="应用到后续图片的张数"
                    />
                    <small>
                      本次 {{ effectiveQuadLocationPropagationCount }} / 剩余 {{ remainingFollowingImageCount }} 张
                    </small>
                  </span>
                </label>
                <div class="propagation-panel-actions">
                  <button type="button" class="action-button" @click="closeQuadLocationPropagation">取消</button>
                  <button type="submit" class="action-button primary" :disabled="!canSubmitQuadLocationPropagation">
                    应用
                  </button>
                </div>
              </form>
            </div>
            <JsonView
              ref="jsonView"
              class="annotation-list"
              :active-quad-index="activeQuadIndex"
              :formatted-items="annotationView.formattedItems"
              :error-message="annotationView.errorMessage"
              @select-quad-index="selectQuadIndex"
            ></JsonView>

            <div class="json-history-actions">
              <button
                class="action-button history-button"
                title="撤销 JSON 操作（Ctrl+Shift+Z）"
                :disabled="!canUndoJson"
                @click="undoJsonEdit"
              >
                撤销 JSON
              </button>
              <button
                class="action-button history-button"
                title="重做 JSON 操作（Ctrl+Shift+Y）"
                :disabled="!canRedoJson"
                @click="redoJsonEdit"
              >
                重做 JSON
              </button>
            </div>

            <div class="annotation-actions">
              <button
                class="action-button copy-location-button"
                :disabled="!canCopyPreviousQuadLocation"
                title="将上一张图片中同下标 Quad 的坐标复制到当前 Quad（Ctrl+E）"
                @click="copyPreviousQuadLocation"
              >
                沿用上图坐标
              </button>
              <button
                class="action-button primary"
                title="更新当前 Quad（Ctrl+S）"
                :disabled="!canOperate"
                @click="modifyJsonItem"
              >
                更新
              </button>
              <button class="action-button" title="新增 Quad（Ctrl+A）" :disabled="!canOperate" @click="addJsonItem">
                新增
              </button>
              <button
                class="action-button danger"
                title="删除当前 Quad（Ctrl+D）"
                :disabled="!canOperate"
                @click="deleteJsonItem"
              >
                删除
              </button>
            </div>
          </section>

          <ImageAnnotationPanel
            ref="imageAnnotationPanelRef"
            v-show="activeInspectorPage === INSPECTOR_PAGE.IMAGE_ANNOTATION"
            v-model="imageAnnotationInput"
            :status="imageAnnotationStatus"
            :error="imageAnnotationError"
            :load-error="imageAnnotationLoadError"
            :loading="imageAnnotationsLoading"
            :can-input="canInputImageAnnotation"
            :can-submit="canSubmitImageAnnotation"
            :image-number="currentImageAnnotation ? currentImageAnnotation.imageIndex + 1 : 0"
            :image-name="imgFileName"
            :saved="currentImageAnnotation?.saved ?? null"
            @submit="submitImageAnnotation"
            @reload="reloadImageAnnotations"
          />

          <DatasetInfoPanel
            v-show="activeInspectorPage === INSPECTOR_PAGE.DATASET"
            :dataset-load-error="datasetLoadError"
            :loaded-product-type="loadedProductType"
            :json-file-name="jsonFileName"
            :img-file-name="imgFileName"
          />

          <section v-show="activeInspectorPage === INSPECTOR_PAGE.DISPLAY" class="inspector-page">
            <header class="panel-header">
              <h2>视图与鼠标操作</h2>
            </header>
            <div class="display-card">
              <div>
                <strong>鼠标当前行为</strong>
                <p>
                  {{ isDirectQuadEditingEnabled ? '悬停选择 Quad；可拖动 Quad 或顶点' : '观察 Quad；通过选点更新标注' }}
                </p>
              </div>
              <button
                class="action-button direct-edit-mode-button"
                :class="{ active: isDirectQuadEditingEnabled }"
                :title="isDirectQuadEditingEnabled ? '返回默认观察模式（Tab）' : '进入直接编辑模式（Tab）'"
                :disabled="!canInteractWithImage"
                :aria-pressed="isDirectQuadEditingEnabled"
                @click="toggleQuadInteraction"
              >
                {{ isDirectQuadEditingEnabled ? '返回默认模式' : '进入直接编辑' }}
              </button>
            </div>
            <div class="stacked-actions">
              <button
                class="action-button"
                title="重置图片位置（R）"
                :disabled="!canInteractWithImage"
                @click="resetPosition"
              >
                重置图片位置
              </button>
              <button
                class="action-button"
                title="切换当前 Quad 显示（Q）"
                :disabled="!canFocusQuad"
                @click="toggleHighlight2ShowQuads"
              >
                切换当前 Quad 显示
              </button>
              <button
                class="action-button"
                title="显示全部 Quad（Ctrl+Shift+Q）"
                :disabled="!canInteractWithImage || quadTotal === 0"
                @click="addAll2ShowQuads"
              >
                显示全部 Quad
              </button>
              <button
                class="action-button"
                title="隐藏全部 Quad（Ctrl+Q）"
                :disabled="!canInteractWithImage"
                @click="clearShowQuads"
              >
                隐藏全部 Quad
              </button>
            </div>
            <p class="panel-note">放大到像素网格后，深色描边框表示鼠标当前对应的单个像素。</p>
          </section>

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
import JsonView from './JsonView.vue';
import ImageView from './ImageView.vue';
import WorkspaceToolbar from './WorkspaceToolbar.vue';
import DatasetInfoPanel from './DatasetInfoPanel.vue';
import ImageAnnotationPanel from './ImageAnnotationPanel.vue';
import { useImageAnnotations } from '../composables/useImageAnnotations.js';
import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';
import Help from './Help.vue';
import HistoryView from './HistoryView.vue';
import { useWorkspaceEditing } from '../composables/useWorkspaceEditing.js';
import { usePointSelectionHistory } from '../composables/usePointSelectionHistory.js';
import { useToastNotifications } from '../composables/useToastNotifications.js';
import { getCurrentAnnotationView, getJsonFileInfo } from '../state/DatasetState.js';
import { createJsonFileService } from '../services/JsonFileService.js';
import {
  createWorkspaceSessionService,
  observeWorkspaceRecord as reportWorkspaceSessionRecord,
} from '../services/WorkspaceSessionService.js';
import { KEYS } from '../utils/BasicFuncs.js';
import { normalizeDevicePixelRatio } from '../utils/CanvasDisplay.js';
import { createShortcutHelpGroups, dispatchShortcut } from '../utils/KeyboardShortcuts.js';
import { WORKSPACE_SHORTCUT_HELP_GROUPS, createWorkspaceShortcutCommands } from '../shortcuts/WorkspaceShortcuts.js';
import { configureZoomCanvas, drawZoomPreview } from '../utils/ZoomViewRenderer.js';
import { getAdjacentQuadIndex, normalizeQuadIndex } from '../state/QuadSelection.js';
import {
  VIEWPORT_MODE,
  VIEWPORT_MODE_EVENT,
  isQuadFocusMode,
  resolveFocusModeQuadIndex,
  transitionViewportMode,
} from '../state/QuadFocusMode.js';
import {
  QUAD_INTERACTION_MODE,
  getQuadInteractionCapabilities,
  isDirectQuadEditingMode,
  toggleQuadInteractionMode,
} from '../state/QuadInteractionMode.js';
import {
  WORKFLOW_OPERATION,
  WORKFLOW_PHASE,
  canChangeQuadSelection,
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
const jsonView = ref(null);
const zoomView = ref(null);

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
const activeQuadIndex = ref(-1);
const quadSelectionLockIndex = ref(-1);
const annotationView = ref({ formattedItems: [], quads: [], errorMessage: '' });
const quadTotal = computed(() => annotationView.value.formattedItems.length);
const isQuadLocationPropagationOpen = ref(false);
const quadLocationPropagationCount = ref(0);
let zoomSourceOrigin = null;
const quadInteractionMode = ref(QUAD_INTERACTION_MODE.DEFAULT);
const quadInteractionCapabilities = computed(() => getQuadInteractionCapabilities(quadInteractionMode.value));
const isDirectQuadEditingEnabled = computed(() => isDirectQuadEditingMode(quadInteractionMode.value));
const viewportMode = ref(VIEWPORT_MODE.FREE);
const isQuadFocusModeEnabled = computed(() => isQuadFocusMode(viewportMode.value));
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
  resetZoomPreview,
  refreshCurrentAnnotations,
  clearCurrentAnnotations,
  synchronizeQuadFocusSelection,
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
  hasPending: hasPendingImageAnnotations,
  busy: imageAnnotationsBusy,
  open: openImageAnnotationDataset,
  clear: clearImageAnnotations,
  reload: reloadImageAnnotations,
  submit: submitImageAnnotation,
  dispose: disposeImageAnnotations,
} = useImageAnnotations({
  imageIndex: imageAnnotationIndex,
  canEdit: canOperate,
  invoke: (channel, request) => ipcRenderer.invoke(channel, request),
  notify: outputMessage,
  subscribeProgress: listener =>
    ipcRenderer.on?.(IPC_CHANNELS.ANNOTATION_PROGRESS, (_event, progress) => listener(progress)),
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
const canFocusQuad = computed(
  () => canInteractWithImage.value && activeQuadIndex.value >= 0 && activeQuadIndex.value < quadTotal.value,
);
const isQuadSelectionLocked = computed(() => quadSelectionLockIndex.value >= 0);
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
const activeQuadLabel = computed(() =>
  activeQuadIndex.value >= 0 ? `${activeQuadIndex.value + 1} / ${quadTotal.value}` : `— / ${quadTotal.value}`,
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
      if (!disposed) jsonView.value?.scrollToBottom();
    }),
});

let zoomCanvasPixelRatio = null;
let activeQuadFocusScheduled = false;

function selectQuadIndex(newIndex, { forceFocus = false } = {}) {
  if (!canChangeQuadSelection(workflowState.value)) return;
  const normalizedIndex = normalizeQuadIndex(newIndex, quadTotal.value);
  if (isQuadSelectionLocked.value && normalizedIndex !== quadSelectionLockIndex.value) return;

  const selectionChanged = activeQuadIndex.value !== normalizedIndex;
  activeQuadIndex.value = normalizedIndex;
  if (selectionChanged || forceFocus) scheduleActiveQuadFocus();
}

function resetQuadSelection() {
  if (isQuadSelectionLocked.value) imgContainerRef.value?.cancelQuadTranslation?.('selection-reset');
  quadSelectionLockIndex.value = -1;
  activeQuadIndex.value = -1;
}

function lockQuadSelectionForTranslation(payload) {
  const quadIndex = payload?.quadIndex;
  if (!canOperate.value || quadIndex !== activeQuadIndex.value) {
    imgContainerRef.value?.cancelQuadTranslation?.('selection-mismatch');
    return;
  }
  quadSelectionLockIndex.value = quadIndex;
}

function unlockQuadSelectionForTranslation(payload = null) {
  if (disposed) return;
  const quadIndex = payload?.quadIndex;
  if (quadIndex === undefined || quadIndex === quadSelectionLockIndex.value) {
    quadSelectionLockIndex.value = -1;
  }
}

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
    if (disposed || activeInspectorPage.value !== INSPECTOR_PAGE.IMAGE_ANNOTATION || !canInputImageAnnotation.value)
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
  window.removeEventListener('beforeunload', guardAnnotationUnload);
  window.removeEventListener('keydown', handleKeyDown);
  disposeNotifications();
});

function syncZoomCanvasPixelRatio() {
  const nextPixelRatio = displayPixelRatio.value;
  if (nextPixelRatio === zoomCanvasPixelRatio) return;

  zoomCanvasPixelRatio = configureZoomCanvas(zoomView.value, nextPixelRatio);
  updateZoomView();
}

watch(displayPixelRatio, syncZoomCanvasPixelRatio);

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
function changeJsonItemSelection(direction) {
  if (!canOperate.value) return;
  selectQuadIndex(
    getAdjacentQuadIndex({
      activeIndex: activeQuadIndex.value,
      quadCount: quadTotal.value,
      direction,
    }),
  );
}

function resetPosition() {
  if (!canInteractWithImage.value) return;
  imgContainerRef.value?.resetPosition();
}

function scheduleActiveQuadFocus() {
  if (activeQuadFocusScheduled || !isQuadFocusModeEnabled.value || !canFocusQuad.value) return;
  activeQuadFocusScheduled = true;
  void nextTick(() => {
    activeQuadFocusScheduled = false;
    if (!isQuadFocusModeEnabled.value || !canFocusQuad.value) return;

    const result = imgContainerRef.value?.focusQuad(activeQuadIndex.value);
    if (!result?.success) outputMessage(result?.error || '无法聚焦当前 Quad。');
  });
}

function synchronizeQuadFocusSelection({ forceFocus = false } = {}) {
  if (!isQuadFocusModeEnabled.value) return;
  selectQuadIndex(
    resolveFocusModeQuadIndex({
      activeIndex: activeQuadIndex.value,
      quadCount: quadTotal.value,
    }),
    { forceFocus },
  );
}

function toggleQuadFocusMode() {
  if (!isQuadFocusModeEnabled.value && !canInteractWithImage.value) {
    outputMessage('请先加载一张可用图片。');
    return;
  }

  viewportMode.value = transitionViewportMode(viewportMode.value, VIEWPORT_MODE_EVENT.TOGGLE_QUAD_FOCUS);
  if (isQuadFocusModeEnabled.value) {
    synchronizeQuadFocusSelection({ forceFocus: true });
    outputMessage('已进入 Quad 聚焦模式。');
  } else {
    outputMessage('已退出 Quad 聚焦模式。');
  }
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
  viewportMode.value = transitionViewportMode(viewportMode.value, VIEWPORT_MODE_EVENT.DATASET_CHANGED);
  clearJsonHistory();
  resetImageSessionForDatasetChange();
  quadLocationPropagationCount.value = imagePositionView.value.total;
}

watch(selectedDots, () => {
  updateZoomView();
});

watch([() => imagePositionView.value.currentIndex, activeQuadIndex], closeQuadLocationPropagation);
watch(activeInspectorPage, page => {
  if (page !== INSPECTOR_PAGE.ANNOTATION) closeQuadLocationPropagation();
});
watch(canApplyQuadLocationForward, enabled => {
  if (!enabled) closeQuadLocationPropagation();
});

// Zoom preview
function updateZoomView(origin = null) {
  if (origin !== null) {
    if (!Number.isFinite(origin?.x) || !Number.isFinite(origin?.y)) return;
    zoomSourceOrigin = { x: origin.x, y: origin.y };
  }
  if (!imageObj.value?.complete || zoomSourceOrigin === null) return;

  try {
    drawZoomPreview(zoomView.value, imageObj.value, zoomSourceOrigin, selectedDots);
  } catch (error) {
    console.error('Failed to draw the zoom preview:', error);
  }
}

function resetZoomPreview() {
  zoomSourceOrigin = null;
  const context = zoomView.value?.getContext('2d');
  if (context !== null && context !== undefined) {
    context.clearRect(0, 0, zoomView.value.width, zoomView.value.height);
  }
}

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

.action-button.direct-edit-mode-button.active {
  border-color: #c25f0d;
  background: #c25f0d;
  color: #ffffff;
}

.action-button.direct-edit-mode-button.active:hover:not(:disabled) {
  border-color: #a94e08;
  background: #a94e08;
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

.annotation-page {
  display: grid;
  grid-template-rows: auto auto auto minmax(120px, 1fr) auto auto;
  gap: 12px;
  overflow: hidden;
}

.panel-header,
.section-heading {
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

.section-heading {
  color: var(--text-primary);
  font-size: var(--font-size-body);
  font-weight: 700;
}

.section-heading small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  font-weight: 400;
}

.section-action-button {
  padding: 3px 5px;
  border: 0;
  background: transparent;
  color: var(--accent-strong);
  font: 600 var(--font-size-caption) / 1.2 var(--font-ui);
  cursor: pointer;
}

.section-action-button:hover:not(:disabled) {
  text-decoration: underline;
}

.section-action-button:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
}

.precision-panel {
  display: grid;
  gap: 9px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-muted);
}

.precision-content {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: 12px;
}

.zoom-view-box {
  width: 122px;
  height: 122px;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background-color: #f2f4f7;
  background-image: linear-gradient(45deg, #dfe3e9 25%, transparent 25%),
    linear-gradient(-45deg, #dfe3e9 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #dfe3e9 75%),
    linear-gradient(-45deg, transparent 75%, #dfe3e9 75%);
  background-position:
    0 0,
    0 6px,
    6px -6px,
    -6px 0;
  background-size: 12px 12px;
}

.zoom-style {
  display: block;
  width: 120px;
  height: 120px;
}

.point-list {
  display: grid;
  grid-template-rows: repeat(4, 1fr);
  gap: 4px;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.point-list li {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 6px;
  align-items: center;
  min-width: 0;
  padding: 4px 6px;
  border-radius: 5px;
  background: var(--surface-raised);
  color: var(--text-secondary);
}

.point-list li > span {
  color: var(--accent);
  font-size: var(--font-size-caption);
  font-weight: 800;
}

.point-list li.empty > span,
.point-list li.empty code {
  color: var(--text-muted);
}

.point-list code {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font: var(--font-size-code) / 1.2 var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.point-history-actions,
.json-history-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.history-button {
  min-height: 40px;
  padding: 0 7px;
  flex-direction: column;
  gap: 4px;
  font-size: var(--font-size-caption);
}

.annotation-list-section {
  display: grid;
  gap: 8px;
  align-self: end;
}

.quad-location-propagation-panel {
  display: grid;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-muted);
}

.propagation-panel-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 8px;
}

.propagation-panel-heading strong {
  font-size: var(--font-size-secondary);
}

.propagation-panel-heading span {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
}

.propagation-field {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  color: var(--text-secondary);
  font-size: var(--font-size-secondary);
}

.propagation-field input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 30px;
  padding: 0 8px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-raised);
  color: var(--text-primary);
  font: 400 var(--font-size-secondary) / 1 var(--font-ui);
}

.propagation-count-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}

.propagation-count-control small {
  color: var(--text-muted);
  font-size: var(--font-size-caption);
  white-space: nowrap;
}

.propagation-panel-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
}

.annotation-list {
  min-height: 0;
}

.annotation-actions,
.stacked-actions {
  display: grid;
  gap: 7px;
}

.annotation-actions {
  grid-template-columns: 1fr 1fr;
}

.action-button {
  padding: 0 10px;
}

.action-button.danger {
  border-color: #edc5c7;
  background: var(--danger-soft);
  color: var(--danger);
}

.action-button.danger:hover:not(:disabled) {
  border-color: var(--danger);
  background: #ffe3e3;
}

.stacked-actions {
  grid-template-columns: 1fr;
}

.display-card {
  display: grid;
  gap: 14px;
  margin: 20px 0;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-muted);
}

.display-card strong {
  font-size: var(--font-size-body);
}

.display-card p,
.panel-note {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: var(--font-size-secondary);
  line-height: 1.5;
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

.panel-note {
  margin-top: 16px;
  padding: 11px;
  border-radius: 7px;
  background: var(--surface-muted);
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

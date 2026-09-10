<template>
  <div class="workspace-shell">
    <TransitionGroup name="toast" tag="div" class="toast-container">
      <div v-for="notification in notifications" :key="notification.id" class="toast-message">
        {{ notification.message }}
      </div>
    </TransitionGroup>

    <header class="workspace-toolbar">
      <div class="app-identity" aria-label="QuadTool">
        <span class="app-mark">Q</span>
        <div>
          <strong>QuadTool</strong>
          <span>像素级四边形标注</span>
        </div>
      </div>

      <div class="toolbar-group toolbar-files">
        <button class="toolbar-button primary" :disabled="!canLoadDataset" @click="chooseJsonFile">
          打开图集 <span class="button-shortcut"><kbd>Ctrl</kbd><kbd>O</kbd></span>
        </button>
        <button
          class="toolbar-button"
          :disabled="imagePositionView.total === 0 || !canLoadImage"
          @click="chooseImgFile"
        >
          匹配图片 <span class="button-shortcut"><kbd>Ctrl</kbd><kbd>I</kbd></span>
        </button>
      </div>

      <div class="toolbar-group image-navigation" aria-label="图片导航">
        <button
          class="icon-button"
          title="上一张图片（A / ←）"
          :disabled="imagePositionView.total === 0 || !canLoadImage"
          @click="changeImageByArrowKeys(KEYS.PREVIOUS)"
        >
          <span aria-hidden="true">‹</span><kbd>A</kbd>
        </button>
        <label class="image-position-control">
          <span class="sr-only">图片序号</span>
          <input
            v-model="jumpImageIndex"
            type="number"
            min="1"
            step="1"
            :max="imagePositionView.total || undefined"
            :placeholder="imagePositionView.total ? '1' : '—'"
            :disabled="imagePositionView.total === 0 || !canLoadImage"
            @keydown.enter.prevent="handleJumpToImageIndexKeyDown"
          />
          <span>/ {{ imagePositionView.total }}</span>
        </label>
        <button
          class="icon-button"
          title="下一张图片（D / →）"
          :disabled="imagePositionView.total === 0 || !canLoadImage"
          @click="changeImageByArrowKeys(KEYS.NEXT)"
        >
          <span aria-hidden="true">›</span><kbd>D</kbd>
        </button>
        <button
          class="toolbar-button compact"
          :disabled="imagePositionView.total === 0 || !canLoadImage"
          @click="jumpToImageIndex"
        >
          跳转 <kbd>Enter</kbd>
        </button>
      </div>
    </header>

    <main class="workspace-main">
      <ImageView
        ref="imgContainerRef"
        :image-obj="imageObj"
        :can-edit="canOperate"
        :can-interact="canInteractWithImage"
        :is-loading="isImageLoading"
        :active-quad-index="activeQuadIndex"
        :selected-dots="selectedDots"
        :image-load-error="imageLoadError"
        :hover-select-mode="isHoverSelectMode"
        @update-zoom-view="updateZoomView"
        @output-message="outputMessage"
        @update-selected-dots="updateSelectedDots"
        @select-quad-index="selectQuadIndex"
        @commit-quad-point-drag="commitQuadPointDrag"
      ></ImageView>

      <aside class="inspector-shell">
        <nav class="inspector-navigation" aria-label="功能分区">
          <div class="inspector-navigation-main">
            <button
              v-for="page in inspectorPages"
              :key="page.id"
              class="inspector-tab"
              :class="{ active: activeInspectorPage === page.id }"
              :title="page.label"
              :aria-label="page.label"
              :aria-pressed="activeInspectorPage === page.id"
              @click="selectInspectorPage(page.id)"
            >
              <span class="inspector-tab-icon" aria-hidden="true">{{ page.icon }}</span>
              <span>{{ page.label }}</span>
              <small>{{ page.shortcut }}</small>
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
            <small>F1</small>
          </button>
        </nav>

        <div class="inspector-content">
          <section v-show="activeInspectorPage === INSPECTOR_PAGE.ANNOTATION" class="inspector-page annotation-page">
            <header class="panel-header">
              <div>
                <span class="eyebrow">当前标注</span>
                <h2>Quad {{ activeQuadLabel }}</h2>
              </div>
              <div class="panel-header-actions">
                <span class="panel-counter">{{ quadTotal }} 个</span>
                <button class="action-button primary" :disabled="!canFocusQuad" @click="focusActiveQuad">
                  聚焦 Quad <kbd>F</kbd>
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
                <button class="action-button history-button" :disabled="!canUndoPoints" @click="undoPointEdit">
                  撤回选点 <span class="button-shortcut"><kbd>Ctrl</kbd><kbd>Z</kbd></span>
                </button>
                <button class="action-button history-button" :disabled="!canRedoPoints" @click="redoPointEdit">
                  重做选点 <span class="button-shortcut"><kbd>Ctrl</kbd><kbd>Y</kbd></span>
                </button>
              </div>
            </div>

            <div class="annotation-list-heading section-heading">
              <span>标注数据</span>
              <small>悬停选择</small>
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
              <button class="action-button history-button" :disabled="!canUndoJson" @click="undoJsonEdit">
                撤销 JSON
                <span class="button-shortcut"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Z</kbd></span>
              </button>
              <button class="action-button history-button" :disabled="!canRedoJson" @click="redoJsonEdit">
                重做 JSON
                <span class="button-shortcut"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Y</kbd></span>
              </button>
            </div>

            <div class="annotation-actions">
              <button class="action-button primary" :disabled="!canOperate" @click="modifyJsonItem">
                更新 <span class="button-shortcut"><kbd>Ctrl</kbd><kbd>S</kbd></span>
              </button>
              <button class="action-button" :disabled="!canOperate" @click="addJsonItem">
                新增 <span class="button-shortcut"><kbd>Ctrl</kbd><kbd>A</kbd></span>
              </button>
              <button class="action-button danger" :disabled="!canOperate" @click="deleteJsonItem">
                删除 <span class="button-shortcut"><kbd>Ctrl</kbd><kbd>D</kbd></span>
              </button>
            </div>
          </section>

          <section v-show="activeInspectorPage === INSPECTOR_PAGE.DATASET" class="inspector-page">
            <header class="panel-header">
              <div>
                <span class="eyebrow">开始与文件信息</span>
                <h2>图集与图片</h2>
              </div>
            </header>
            <dl class="metadata-list">
              <div>
                <dt>产品类型</dt>
                <dd>{{ loadedProductType || '未加载' }}</dd>
              </div>
              <div>
                <dt>图集 JSON</dt>
                <dd :title="jsonFileName">{{ jsonFileName || '未加载' }}</dd>
              </div>
              <div>
                <dt>图片</dt>
                <dd :title="imgFileName">{{ imgFileName || '未加载' }}</dd>
              </div>
            </dl>
            <div class="dataset-actions-heading section-heading">
              <span>文件操作</span>
            </div>
            <div class="stacked-actions">
              <button class="action-button primary" :disabled="!canLoadDataset" @click="chooseJsonFile">
                打开或更换图集 <span class="button-shortcut"><kbd>Ctrl</kbd><kbd>O</kbd></span>
              </button>
              <button
                class="action-button"
                :disabled="imagePositionView.total === 0 || !canLoadImage"
                @click="chooseImgFile"
              >
                手动匹配图片 <span class="button-shortcut"><kbd>Ctrl</kbd><kbd>I</kbd></span>
              </button>
            </div>
          </section>

          <section v-show="activeInspectorPage === INSPECTOR_PAGE.DISPLAY" class="inspector-page">
            <header class="panel-header">
              <div>
                <span class="eyebrow">定位与覆盖层</span>
                <h2>视图与鼠标操作</h2>
              </div>
            </header>
            <div class="display-card">
              <div>
                <strong>鼠标当前行为</strong>
                <p>{{ isHoverSelectMode ? '悬停到单个 Quad 时自动选择' : '单击图像像素以添加或删除点位' }}</p>
              </div>
              <button class="action-button" :disabled="!canInteractWithImage" @click="toggleInteractionMode">
                {{ isHoverSelectMode ? '切换为单击标点' : '切换为悬停选 Quad' }} <kbd>Tab</kbd>
              </button>
            </div>
            <div class="stacked-actions">
              <button class="action-button" :disabled="!canInteractWithImage" @click="resetPosition">
                重置图片位置 <kbd>R</kbd>
              </button>
              <button class="action-button" :disabled="!canFocusQuad" @click="toggleHighlight2ShowQuads">
                切换当前 Quad 显示 <kbd>Q</kbd>
              </button>
              <button
                class="action-button"
                :disabled="!canInteractWithImage || quadTotal === 0"
                @click="addAll2ShowQuads"
              >
                显示全部 Quad <span class="button-shortcut"><kbd>Ctrl</kbd><kbd>Shift</kbd><kbd>Q</kbd></span>
              </button>
              <button class="action-button" :disabled="!canInteractWithImage" @click="clearShowQuads">
                隐藏全部 Quad <span class="button-shortcut"><kbd>Ctrl</kbd><kbd>Q</kbd></span>
              </button>
            </div>
            <p class="panel-note">放大到像素网格后，深色描边框表示鼠标当前对应的单个像素。</p>
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
        <span>鼠标：{{ isHoverSelectMode ? '悬停选 Quad' : '单击标点' }}</span>
        <span class="status-divider"></span>
        <span>Quad {{ activeQuadLabel }}</span>
      </div>
      <div class="shortcut-only-hints">
        <span class="status-hint shortcut-only-label">仅快捷键</span>
        <span class="status-hint"><kbd>W</kbd>/<kbd>S</kbd> 选 Quad</span>
        <span class="status-hint"><kbd>Z</kbd> 聚焦像素</span>
        <span class="status-hint"><kbd>1–4</kbd> 删除点</span>
        <span class="status-hint"><kbd>C</kbd> 清空 P1–P4</span>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { computed, ref, reactive, onMounted, onUnmounted, watch, nextTick } from 'vue';
import JsonView from './JsonView.vue';
import ImageView from './ImageView.vue';
import Help from './Help.vue';
import {
  prepareJsonProcess,
  commitPreparedJsonProcess,
  getAdjacentJsonImageTarget,
  getCurrentAnnotationView,
  getCurrentJsonImageIndex,
  getJsonImageDialogContext,
  getJsonImageTarget,
  applyJsonHistoryEntry,
  updateQuadPointWithHistory,
  updateJsonWithHistory,
  getJsonImagePosition,
  getJsonFileInfo,
  resetPicJson,
  createDatasetMutationSnapshot,
  restoreDatasetMutationSnapshot,
} from '../state/DatasetState.js';
import {
  HISTORY_DIRECTION,
  clearUndoRedoHistory,
  commitHistoryStep,
  createUndoRedoHistory,
  peekHistoryEntry,
  recordHistoryEntry,
} from '../state/UndoRedoHistory.js';
import { KEYS } from '../utils/BasicFuncs.js';
import { imagePointToDatasetPoint } from '../utils/AnnotationCoordinates.js';
import { handleShortcutKeyDown } from '../utils/KeyboardShortcuts.js';
import { loadRendererImage } from '../utils/RendererImageLoader.js';
import { configureZoomCanvas, drawZoomPreview } from '../utils/ZoomViewRenderer.js';
import {
  WORKFLOW_OPERATION,
  WORKFLOW_PHASE,
  canApplySaveResult,
  canChangeQuadSelection,
  canEdit as canEditWorkflow,
  canStartOperation,
  commitDataset,
  completeOperation,
  createWorkflowState,
  failOperation,
  isCurrentOperation,
  isOperationActive,
  isWorkflowBusy,
  operationReturnsTo,
  startDatasetLoad,
  startImageLoad,
  startSave,
} from '../state/WorkflowState.js';

const ipcRenderer = window.electron.ipcRenderer;

// Child component and canvas references
const imgContainerRef = ref(null);
const jsonView = ref(null);
const zoomView = ref(null);

const INSPECTOR_PAGE = Object.freeze({
  ANNOTATION: 'annotation',
  DATASET: 'dataset',
  DISPLAY: 'display',
  HELP: 'help',
});
const inspectorPages = Object.freeze([
  { id: INSPECTOR_PAGE.DATASET, label: '图集与图片', icon: '▤', shortcut: 'Ctrl+1' },
  { id: INSPECTOR_PAGE.ANNOTATION, label: 'Quad 标注', icon: '◇', shortcut: 'Ctrl+2' },
  { id: INSPECTOR_PAGE.DISPLAY, label: '视图与交互', icon: '◐', shortcut: 'Ctrl+3' },
]);
const validInspectorPages = new Set([...inspectorPages.map(page => page.id), INSPECTOR_PAGE.HELP]);
const activeInspectorPage = ref(INSPECTOR_PAGE.DATASET);
let previousInspectorPage = INSPECTOR_PAGE.DATASET;

// Dataset and current image state
const activeQuadIndex = ref(-1);
const annotationView = ref({ formattedItems: [], quads: [], errorMessage: '' });
const quadTotal = computed(() => annotationView.value.formattedItems.length);
const imagePositionView = ref({ currentIndex: -1, total: 0 });
const jumpImageIndex = ref('');
const selectedDots = reactive([]);
const pointHistory = reactive(createUndoRedoHistory(50));
const jsonHistoryByImage = reactive(new Map());
const imageObj = ref(new Image());
const imgFileName = ref(null);
const jsonFileName = ref(null);
const loadedProductType = ref('');
let imgFilePath = '';
const imageCoordinateScale = ref({ x: 1, y: 1 });
let zoomSourceOrigin = null;
const isHoverSelectMode = ref(false);

// Operation and image request state
const workflowState = ref(createWorkflowState());
const workflowBusy = computed(() => isWorkflowBusy(workflowState.value));
const canOperate = computed(() => canEditWorkflow(workflowState.value));
const canUndoPoints = computed(() => canOperate.value && pointHistory.undoStack.length > 0);
const canRedoPoints = computed(() => canOperate.value && pointHistory.redoStack.length > 0);
const canUndoJson = computed(() => canOperate.value && Boolean(getCurrentJsonHistory()?.undoStack.length));
const canRedoJson = computed(() => canOperate.value && Boolean(getCurrentJsonHistory()?.redoStack.length));
const canLoadDataset = computed(() => canStartOperation(workflowState.value, WORKFLOW_OPERATION.LOAD_DATASET));
const canLoadImage = computed(() => canStartOperation(workflowState.value, WORKFLOW_OPERATION.LOAD_IMAGE));
const isImageLoading = computed(() => isOperationActive(workflowState.value, WORKFLOW_OPERATION.LOAD_IMAGE));
const canInteractWithImage = computed(() => !isImageLoading.value && Boolean(imageObj.value?.src));
const canFocusQuad = computed(
  () => canInteractWithImage.value && activeQuadIndex.value >= 0 && activeQuadIndex.value < quadTotal.value,
);
const activeQuadLabel = computed(() =>
  activeQuadIndex.value >= 0 ? `${activeQuadIndex.value + 1} / ${quadTotal.value}` : `— / ${quadTotal.value}`,
);
const workflowStatusText = computed(() => {
  const labels = {
    [WORKFLOW_PHASE.EMPTY]: '等待打开图集',
    [WORKFLOW_PHASE.DATASET_READY]: '图集已加载',
    [WORKFLOW_PHASE.READY]: '可以编辑',
    [WORKFLOW_PHASE.LOADING_DATASET]: '正在打开图集…',
    [WORKFLOW_PHASE.LOADING_IMAGE]: '正在加载图片…',
    [WORKFLOW_PHASE.SAVING]: '正在保存…',
  };
  return labels[workflowState.value.phase] ?? '未知状态';
});
const imageLoadError = ref(null);
let activeImageRequest = null;
let imageAttemptCounter = 0;

// Notification state
const NOTIFICATION_DURATION = 3000;
const MAX_VISIBLE_NOTIFICATIONS = 4;
const notifications = ref([]);
const notificationTimers = new Map();
let notificationId = 0;

let removeChooseJsonFileResponseListener = null;

function applyWorkflowTransition(result) {
  if (!result.success) return false;
  workflowState.value = result.state;
  return true;
}

function selectQuadIndex(newIndex) {
  if (!canChangeQuadSelection(workflowState.value)) return;
  const normalizedIndex = Number.isInteger(newIndex) && newIndex >= 0 && newIndex < quadTotal.value ? newIndex : -1;

  activeQuadIndex.value = normalizedIndex;
}

function resetQuadSelection() {
  activeQuadIndex.value = -1;
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

onMounted(() => {
  configureZoomCanvas(zoomView.value);
  window.addEventListener('keydown', handleKeyDown);
  removeChooseJsonFileResponseListener = ipcRenderer.on('choose-json-file-response', handleChooseJsonFileResponse);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
  removeChooseJsonFileResponseListener?.();
  removeChooseJsonFileResponseListener = null;
  clearNotifications();
});

// Keyboard shortcuts
const keyActions = {
  1: {
    default: () => clearOneDot(0),
    ctrl: () => selectInspectorPage(INSPECTOR_PAGE.DATASET),
  },
  2: {
    default: () => clearOneDot(1),
    ctrl: () => selectInspectorPage(INSPECTOR_PAGE.ANNOTATION),
  },
  3: {
    default: () => clearOneDot(2),
    ctrl: () => selectInspectorPage(INSPECTOR_PAGE.DISPLAY),
  },
  4: {
    default: () => clearOneDot(3),
  },
  w: {
    default: () => changeJsonItemSelection(KEYS.PREVIOUS),
  },
  s: {
    default: () => changeJsonItemSelection(KEYS.NEXT),
    ctrl: () => modifyJsonItem(),
  },
  d: {
    default: () => changeImageByArrowKeys(KEYS.NEXT),
    ctrl: () => deleteJsonItem(),
  },
  a: {
    default: () => changeImageByArrowKeys(KEYS.PREVIOUS),
    ctrl: () => addJsonItem(),
  },
  c: {
    default: () => clearDots(),
  },
  r: {
    default: () => resetPosition(),
  },
  f: {
    default: () => focusActiveQuad(),
  },
  z: {
    default: () => focusPixelAtMouse(),
    ctrl: () => undoPointEdit(),
    ctrlShift: () => undoJsonEdit(),
  },
  y: {
    ctrl: () => redoPointEdit(),
    ctrlShift: () => redoJsonEdit(),
  },
  q: {
    default: () => toggleHighlight2ShowQuads(),
    ctrl: () => clearShowQuads(),
    ctrlShift: () => addAll2ShowQuads(),
  },
  o: {
    ctrl: () => chooseJsonFile(),
  },
  i: {
    ctrl: () => chooseImgFile(),
  },
  ArrowLeft: {
    default: () => changeImageByArrowKeys(KEYS.PREVIOUS),
  },
  ArrowRight: {
    default: () => changeImageByArrowKeys(KEYS.NEXT),
  },
  ArrowUp: {
    default: () => changeJsonItemSelection(KEYS.PREVIOUS),
  },
  ArrowDown: {
    default: () => changeJsonItemSelection(KEYS.NEXT),
  },
  Tab: {
    default: () => toggleInteractionMode(),
  },
};

const shortcutHelpGroups = Object.freeze([
  {
    title: '导航与定位',
    items: [
      { keys: ['Ctrl', '1'], label: '打开图集与图片页' },
      { keys: ['Ctrl', '2'], label: '打开 Quad 标注页' },
      { keys: ['Ctrl', '3'], label: '打开视图与交互页' },
      { keys: ['W', '↑'], separator: '/', label: '上一个 Quad' },
      { keys: ['S', '↓'], separator: '/', label: '下一个 Quad' },
      { keys: ['A', '←'], separator: '/', label: '上一张图片' },
      { keys: ['D', '→'], separator: '/', label: '下一张图片' },
      { keys: ['F'], label: '聚焦当前 Quad' },
      { keys: ['Z'], label: '聚焦鼠标所在像素' },
      { keys: ['R'], label: '重置图片位置' },
      { keys: ['Ctrl', 'O'], label: '打开图集 JSON' },
      { keys: ['Ctrl', 'I'], label: '手动匹配图片' },
    ],
  },
  {
    title: '标注编辑',
    items: [
      { keys: ['1', '2', '3', '4'], separator: '/', label: '移除对应点位' },
      { keys: ['Ctrl', 'S'], label: '更新当前 Quad' },
      { keys: ['Ctrl', 'A'], label: '新增 Quad' },
      { keys: ['Ctrl', 'D'], label: '删除当前 Quad' },
      { keys: ['C'], label: '清空待提交的 P1–P4' },
      { keys: ['Ctrl', 'Z'], label: '撤回选点' },
      { keys: ['Ctrl', 'Y'], label: '重做选点' },
      { keys: ['Ctrl', 'Shift', 'Z'], label: '撤销 JSON 操作' },
      { keys: ['Ctrl', 'Shift', 'Y'], label: '重做 JSON 操作' },
    ],
  },
  {
    title: '显示',
    items: [
      { keys: ['Q'], label: '切换当前 Quad 显示' },
      { keys: ['Ctrl', 'Q'], label: '隐藏全部 Quad' },
      { keys: ['Ctrl', 'Shift', 'Q'], label: '显示全部 Quad' },
      { keys: ['Tab'], label: '切换悬停选择 / 单击标点' },
      { keys: ['F1'], label: '打开或关闭帮助' },
    ],
  },
]);

function handleKeyDown(e) {
  if (e.key === 'F1') {
    e.preventDefault();
    if (!e.repeat) selectInspectorPage(INSPECTOR_PAGE.HELP);
    return;
  }
  if (activeInspectorPage.value === INSPECTOR_PAGE.HELP) {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!e.repeat) selectInspectorPage(previousInspectorPage);
    }
    return;
  }
  handleShortcutKeyDown(e, keyActions);
}

// Notifications
function removeNotification(id) {
  notifications.value = notifications.value.filter(notification => notification.id !== id);
  const timer = notificationTimers.get(id);
  if (timer) clearTimeout(timer);
  notificationTimers.delete(id);
}

function outputMessage(message) {
  const notification = { id: ++notificationId, message: String(message) };
  notifications.value.push(notification);

  if (notifications.value.length > MAX_VISIBLE_NOTIFICATIONS) {
    removeNotification(notifications.value[0].id);
  }

  const timer = setTimeout(() => removeNotification(notification.id), NOTIFICATION_DURATION);
  notificationTimers.set(notification.id, timer);
}

// Child component commands
function clearOneDot(index) {
  if (!canOperate.value) return;
  if (!Number.isInteger(index) || index < 0 || index >= selectedDots.length) return;

  const nextDots = cloneSelectedDots(selectedDots);
  nextDots.splice(index, 1);
  applyPointEdit(nextDots);
}

function changeJsonItemSelection(direction) {
  if (!canOperate.value) return;
  if (direction === KEYS.NEXT) {
    selectQuadIndex(Math.min(activeQuadIndex.value + 1, quadTotal.value));
  } else if (direction === KEYS.PREVIOUS) {
    selectQuadIndex(Math.max(activeQuadIndex.value - 1, -1));
  }
}

function resetPosition() {
  if (canInteractWithImage.value) imgContainerRef.value?.resetPosition();
}

function focusActiveQuad() {
  if (!canFocusQuad.value) {
    outputMessage('Please activate a Quad before focusing it.');
    return;
  }
  const result = imgContainerRef.value?.focusQuad(activeQuadIndex.value);
  if (!result?.success) outputMessage(result?.error || 'Failed to focus the active Quad.');
}

function focusPixelAtMouse() {
  const result = imgContainerRef.value?.focusPixelAtMouse();
  if (!result?.success) outputMessage(result?.error || 'Failed to focus the pixel under the mouse.');
}

function cloneSelectedDots(dots) {
  return dots.map(dot => ({ ...dot }));
}

function selectedDotsEqual(leftDots, rightDots) {
  return (
    leftDots.length === rightDots.length &&
    leftDots.every((dot, index) => dot.x === rightDots[index]?.x && dot.y === rightDots[index]?.y)
  );
}

function replaceSelectedDots(dots) {
  selectedDots.splice(0, selectedDots.length, ...cloneSelectedDots(dots));
}

function applyPointEdit(nextDots) {
  if (!Array.isArray(nextDots)) return false;

  const beforeDots = cloneSelectedDots(selectedDots);
  const afterDots = cloneSelectedDots(nextDots);
  if (selectedDotsEqual(beforeDots, afterDots)) return false;

  replaceSelectedDots(afterDots);
  recordHistoryEntry(pointHistory, { beforeDots, afterDots });
  return true;
}

function applyPointHistory(direction) {
  if (!canOperate.value) return;

  const historyEntry = peekHistoryEntry(pointHistory, direction);
  if (!historyEntry) return;

  replaceSelectedDots(direction === HISTORY_DIRECTION.UNDO ? historyEntry.beforeDots : historyEntry.afterDots);
  commitHistoryStep(pointHistory, direction, historyEntry);
}

function undoPointEdit() {
  applyPointHistory(HISTORY_DIRECTION.UNDO);
}

function redoPointEdit() {
  applyPointHistory(HISTORY_DIRECTION.REDO);
}

function resetDots() {
  replaceSelectedDots([]);
  clearUndoRedoHistory(pointHistory);
}

function clearDots() {
  if (!canOperate.value) return;
  applyPointEdit([]);
}

// JSON Operations
function getCurrentJsonHistory(createIfMissing = false) {
  const imageIndex = getCurrentJsonImageIndex();
  if (imageIndex < 0) return null;

  let history = jsonHistoryByImage.get(imageIndex);
  if (!history && createIfMissing) {
    history = createUndoRedoHistory(30);
    jsonHistoryByImage.set(imageIndex, history);
  }
  return history ?? null;
}

function getJsonActionLabel(action) {
  const labels = {
    [KEYS.JSON_MODIFY]: '更新 Quad',
    [KEYS.JSON_ADD]: '新增 Quad',
    [KEYS.JSON_DELETE]: '删除 Quad',
  };
  return labels[action] ?? 'JSON 操作';
}

async function runSaveTransaction(mutate, onSaved = () => {}) {
  const sourceImageIndex = getCurrentJsonImageIndex();
  const started = startSave(workflowState.value, { sourceImageIndex });
  if (!applyWorkflowTransition(started)) {
    outputMessage(started.error);
    return false;
  }

  const operationId = started.operationId;
  const datasetSnapshot = createDatasetMutationSnapshot();
  let completionPhase = null;
  let operationCompleted = false;

  function finishOperation() {
    if (operationCompleted) return true;
    operationCompleted = applyWorkflowTransition(completeOperation(workflowState.value, operationId, completionPhase));
    return operationCompleted;
  }

  try {
    const mutationError = mutate();
    if (mutationError !== null) {
      outputMessage(mutationError);
      return false;
    }

    const saved = await saveJsonFile();
    if (!canApplySaveResult(workflowState.value, operationId, getCurrentJsonImageIndex())) {
      outputMessage('Ignored a stale save result because the dataset or image context changed.');
      return false;
    }

    if (!saved) {
      if (!restoreDatasetMutationSnapshot(datasetSnapshot)) {
        outputMessage('Failed to restore JSON state after the save error. Please reload the dataset.');
        completionPhase = WORKFLOW_PHASE.DATASET_READY;
        clearCurrentAnnotations('JSON state is unavailable. Please reload the dataset.');
      }
      return false;
    }

    if (!finishOperation()) return false;
    onSaved();
    return true;
  } finally {
    if (isCurrentOperation(workflowState.value, operationId, WORKFLOW_OPERATION.SAVE)) finishOperation();
  }
}

async function commitQuadPointDrag(payload) {
  const { quadIndex, pointIndex, imagePoint } = payload ?? {};
  if (
    !canOperate.value ||
    quadIndex !== activeQuadIndex.value ||
    !Number.isInteger(pointIndex) ||
    pointIndex < 0 ||
    pointIndex >= 4
  ) {
    refreshCurrentAnnotations({ redrawOverlay: true });
    outputMessage('The dragged Quad point no longer matches the active annotation.');
    return;
  }

  const datasetPoint = imagePointToDatasetPoint(imagePoint, imageCoordinateScale.value);
  if (datasetPoint === null) {
    refreshCurrentAnnotations({ redrawOverlay: true });
    outputMessage('Failed to map the dragged point to the dataset coordinates.');
    return;
  }

  let historyEntry = null;
  const saved = await runSaveTransaction(
    () => {
      const updateResult = updateQuadPointWithHistory(quadIndex, pointIndex, datasetPoint);
      historyEntry = updateResult.historyEntry ?? null;
      return updateResult.success ? null : updateResult.error;
    },
    () => {
      if (historyEntry) recordHistoryEntry(getCurrentJsonHistory(true), historyEntry);
      refreshCurrentAnnotations({ redrawOverlay: true });
      selectQuadIndex(quadIndex);
      outputMessage(`已更新 Quad ${quadIndex + 1} 的顶点。`);
    },
  );

  if (!saved) refreshCurrentAnnotations({ redrawOverlay: true });
}

async function performJsonAction(action) {
  if (!canOperate.value) {
    outputMessage('JSON operation is disabled until the image matches the dataset.');
    return;
  }

  const affectedQuadIndex = activeQuadIndex.value;
  let historyEntry = null;
  await runSaveTransaction(
    () => {
      outputMessage('Start operate: ' + action);
      const updateResult = updateJsonWithHistory(
        action,
        imageCoordinateScale.value,
        activeQuadIndex.value,
        selectedDots,
      );
      historyEntry = updateResult.historyEntry ?? null;
      return updateResult.success ? null : updateResult.error;
    },
    () => {
      if (historyEntry) recordHistoryEntry(getCurrentJsonHistory(true), historyEntry);
      if (action === KEYS.JSON_DELETE) {
        refreshCurrentAnnotations({ resetSelection: true, deletedQuadIndex: affectedQuadIndex });
      } else if (action === KEYS.JSON_ADD) {
        refreshCurrentAnnotations({ showNewQuad: true });
      } else {
        refreshCurrentAnnotations({ redrawOverlay: true });
      }
      if (action === KEYS.JSON_ADD) nextTick(() => jsonView.value?.scrollToBottom());
      resetDots();
    },
  );
}

async function applyJsonHistory(direction) {
  if (!canOperate.value) return;

  const history = getCurrentJsonHistory();
  const historyEntry = peekHistoryEntry(history, direction);
  if (!historyEntry) return;

  let mutationResult = null;
  await runSaveTransaction(
    () => {
      mutationResult = applyJsonHistoryEntry(historyEntry, direction);
      return mutationResult.success ? null : mutationResult.error;
    },
    () => {
      if (!commitHistoryStep(history, direction, historyEntry)) {
        outputMessage('JSON 历史状态异常，请重新加载图集。');
        return;
      }

      const refreshOptions = { resetSelection: true };
      if (mutationResult.mutationType === 'delete') {
        refreshOptions.deletedQuadIndex = mutationResult.itemIndex;
      } else if (mutationResult.mutationType === 'insert') {
        refreshOptions.insertedQuadIndex = mutationResult.itemIndex;
        refreshOptions.showQuadIndex = mutationResult.itemIndex;
      } else {
        refreshOptions.redrawOverlay = true;
      }
      refreshCurrentAnnotations(refreshOptions);
      selectQuadIndex(mutationResult.activeQuadIndex);
      outputMessage(
        `${direction === HISTORY_DIRECTION.UNDO ? '已撤销' : '已重做'}：${getJsonActionLabel(historyEntry.action)}。`,
      );
    },
  );
}

function undoJsonEdit() {
  void applyJsonHistory(HISTORY_DIRECTION.UNDO);
}

function redoJsonEdit() {
  void applyJsonHistory(HISTORY_DIRECTION.REDO);
}

function addJsonItem() {
  performJsonAction(KEYS.JSON_ADD);
}

function deleteJsonItem() {
  performJsonAction(KEYS.JSON_DELETE);
}

function modifyJsonItem() {
  performJsonAction(KEYS.JSON_MODIFY);
}

async function saveJsonFile() {
  return saveJsonFileInfo(getJsonFileInfo());
}

async function saveJsonFileInfo(jsonFileInfo, { backupOriginal = false } = {}) {
  try {
    const response = await ipcRenderer.invoke('save-json-file', { ...jsonFileInfo, backupOriginal });
    if (!response.success) {
      const errorMessage = response.error || 'Unknown error';
      console.error('Failed to save JSON file:', errorMessage);
      outputMessage(`Failed to save JSON: ${errorMessage}`);
      return false;
    }
    if (response.backupPath) {
      outputMessage(
        `Temporary JSON backup created and scheduled for automatic deletion in 7 days: ${response.backupPath}`,
      );
    }
    return true;
  } catch (error) {
    console.error('An error occurred while saving JSON file:', error);
    outputMessage(`Failed to save JSON: ${error.message}`);
    return false;
  }
}

function clearNotifications() {
  for (const timer of notificationTimers.values()) clearTimeout(timer);
  notificationTimers.clear();
  notifications.value = [];
}

function refreshImagePositionView() {
  const position = getJsonImagePosition();
  imagePositionView.value = position;
  return position;
}

// Dataset and image initialization
async function initProcessInfo(jsonImageIndex = null) {
  try {
    if (!imageObj.value || imageObj.value.src === '') {
      outputMessage('initProcessInfo Error.');
      return false;
    } else {
      await nextTick();
      if (!(await imgContainerRef.value.initImgInfo())) return false;
    }

    const resetPictureResult = resetPicJson(imgFilePath, jsonImageIndex);
    if (!resetPictureResult.success) {
      clearCurrentAnnotations(
        resetPictureResult.error ||
          (imgFilePath
            ? `No JSON data found for image path:\n${imgFilePath}`
            : 'No JSON data found for the current image.'),
      );
      refreshImagePositionView();
      jumpImageIndex.value = '';
      return false;
    }
    refreshCurrentAnnotations({ resetSelection: true, resetVisibility: true });

    const position = refreshImagePositionView();
    jumpImageIndex.value = position.currentIndex + 1;
    return true;
  } catch (error) {
    console.error(`Error name: ${error.name}`);
    console.error(`Error message: ${error.message}`);
    console.error(`Stack trace: ${error.stack}`);
  }
}

function renderAnnotationQuads({
  resetVisibility = false,
  deletedQuadIndex = null,
  insertedQuadIndex = null,
  showNewQuad = false,
  showQuadIndex = null,
  redrawOverlay = false,
} = {}) {
  imgContainerRef.value.resetQuadsArray(annotationView.value.quads, imageCoordinateScale.value, {
    deletedIndex: deletedQuadIndex,
    insertedIndex: insertedQuadIndex,
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
  if (options.resetSelection) resetQuadSelection();
  annotationView.value = { ...getCurrentAnnotationView(), errorMessage: '' };
  renderAnnotationQuads(options);
}

function clearCurrentAnnotations(errorMessage = '') {
  resetQuadSelection();
  annotationView.value = { formattedItems: [], quads: [], errorMessage };
  renderAnnotationQuads({ resetVisibility: true });
}
// Image request lifecycle
function chooseImgFile() {
  if (!canLoadImage.value) {
    outputMessage(workflowBusy.value ? 'Please wait for the current operation to finish.' : 'No dataset is available.');
    return;
  }
  if (getJsonImagePosition().total === 0) {
    outputMessage('Please load a JSON dataset with image items first.');
    return;
  }
  try {
    const started = startImageLoad(workflowState.value);
    if (!applyWorkflowTransition(started)) {
      outputMessage(started.error);
      return;
    }

    imageLoadError.value = null;
    const requestId = ++imageAttemptCounter;
    activeImageRequest = {
      requestId,
      operationId: started.operationId,
      source: 'manual',
      targetImageIndex: null,
      path: '',
      direction: '',
      attemptedIndexes: new Set(),
    };
    void requestPreparedImage('open-image-file-dialog', { ...getJsonImageDialogContext(), requestId });
  } catch (error) {
    console.error('Error while sending IPC message open-image-file-dialog:', error);
    handleImageRequestFailure(error.message);
  }
}

function changeImageByArrowKeys(direction) {
  if (!canLoadImage.value) {
    outputMessage('Please wait for the current operation to finish.');
    return;
  }

  const target = getAdjacentJsonImageTarget(direction, getCurrentJsonImageIndex());
  if (!target.success) {
    outputMessage(target.error);
    return;
  }
  startDatasetImageRequest(target, direction);
}

function jumpToImageIndex() {
  if (!canLoadImage.value) {
    outputMessage('Please wait for the current operation to finish.');
    return;
  }

  const inputValue = String(jumpImageIndex.value).trim();
  if (!/^\d+$/.test(inputValue)) {
    outputMessage('Image index must be an integer starting from 1.');
    return;
  }

  const pictureNumber = Number(inputValue);
  const { total } = getJsonImagePosition();
  if (!Number.isSafeInteger(pictureNumber) || pictureNumber < 1 || pictureNumber > total) {
    outputMessage(`Image index must be between 1 and ${total}.`);
    return;
  }

  const target = getJsonImageTarget(pictureNumber - 1);
  if (!target.success) {
    outputMessage(target.error);
    return;
  }
  startDatasetImageRequest(target, '');
}

function handleJumpToImageIndexKeyDown(event) {
  if (!event.repeat) jumpToImageIndex();
}

function sendImageFileRequest(path, requestId) {
  const { jsonFilePath } = getJsonImageDialogContext();
  void requestPreparedImage('prepare-image', { imagePath: path, jsonFilePath, requestId });
  outputMessage('Get file response...');
}

async function requestPreparedImage(channel, request) {
  try {
    const response = await ipcRenderer.invoke(channel, request);
    await handlePreparedImageResponse(response);
  } catch (error) {
    if (activeImageRequest?.requestId === request.requestId) {
      handleImageRequestFailure(error.message, activeImageRequest.path);
    }
  }
}

function startDatasetImageRequest(target, direction, previousRequest = null) {
  const attemptedIndexes = previousRequest?.attemptedIndexes ?? new Set();
  const currentImageIndex = getCurrentJsonImageIndex();
  if (!previousRequest && currentImageIndex >= 0) attemptedIndexes.add(currentImageIndex);
  attemptedIndexes.add(target.index);

  let operationId;
  if (previousRequest) {
    operationId = previousRequest.operationId;
  } else {
    const started = startImageLoad(workflowState.value);
    if (!applyWorkflowTransition(started)) {
      outputMessage(started.error);
      return false;
    }
    operationId = started.operationId;
  }

  const requestId = ++imageAttemptCounter;
  activeImageRequest = {
    requestId,
    operationId,
    source: 'dataset',
    targetImageIndex: target.index,
    path: target.path,
    direction,
    attemptedIndexes,
  };
  imageLoadError.value = null;
  sendImageFileRequest(target.path, requestId);
  return true;
}

function retryDatasetImageRequest() {
  const failedRequest = activeImageRequest;
  if (failedRequest?.source !== 'dataset') return false;

  const nextTarget = getAdjacentJsonImageTarget(failedRequest.direction, failedRequest.targetImageIndex);
  if (!nextTarget.success || failedRequest.attemptedIndexes.has(nextTarget.index)) return false;

  outputMessage(`Skipping unavailable image and trying JSON item ${nextTarget.index + 1}.`);
  startDatasetImageRequest(nextTarget, failedRequest.direction, failedRequest);
  return true;
}

function resetImageRequestState() {
  activeImageRequest = null;
}

function handleImageRequestFailure(errorMessage, failedPath = '') {
  const failedRequest = activeImageRequest;
  outputMessage(`Failed to open image${failedPath ? `: ${failedPath}` : ''}.`);
  outputMessage(errorMessage || 'Unknown image loading error.');

  if (retryDatasetImageRequest()) return;

  const canRestorePreviousImage = operationReturnsTo(
    workflowState.value,
    failedRequest?.operationId,
    WORKFLOW_PHASE.READY,
  );
  if (canRestorePreviousImage) {
    const position = refreshImagePositionView();
    jumpImageIndex.value = position.currentIndex >= 0 ? position.currentIndex + 1 : '';
    imageLoadError.value = null;
  } else {
    imageObj.value = null;
    imgFileName.value = '';
    imgFilePath = '';
    refreshImagePositionView();
    jumpImageIndex.value = '';
    imageLoadError.value = {
      path: failedPath,
      message: errorMessage || 'Unknown image loading error.',
    };
    resetDots();
    resetZoomPreview();
  }
  if (failedRequest?.operationId) {
    applyWorkflowTransition(failOperation(workflowState.value, failedRequest.operationId));
  }
  resetImageRequestState();
}

async function handlePreparedImageResponse(response) {
  if (!activeImageRequest || response?.requestId !== activeImageRequest.requestId) return;
  if (!isCurrentOperation(workflowState.value, activeImageRequest.operationId, WORKFLOW_OPERATION.LOAD_IMAGE)) return;

  if (response.canceled) {
    const canceledRequest = activeImageRequest;
    applyWorkflowTransition(failOperation(workflowState.value, canceledRequest.operationId));
    resetImageRequestState();
    return;
  }

  if (response.success) {
    const completedRequest = activeImageRequest;
    const imageInfo = response.imageInfo;
    try {
      const loadedImage = await loadRendererImage(imageInfo.url);
      if (
        !activeImageRequest ||
        activeImageRequest.requestId !== completedRequest.requestId ||
        !isCurrentOperation(workflowState.value, completedRequest.operationId, WORKFLOW_OPERATION.LOAD_IMAGE)
      ) {
        return;
      }
      if (
        loadedImage.naturalWidth !== imageInfo.displayWidth ||
        loadedImage.naturalHeight !== imageInfo.displayHeight
      ) {
        throw new Error('The prepared image dimensions do not match the loaded image.');
      }
      resetZoomPreview();
      imageObj.value = loadedImage;
      imageCoordinateScale.value = {
        x: imageInfo.coordinateScaleX,
        y: imageInfo.coordinateScaleY,
      };
    } catch (error) {
      handleImageRequestFailure(error.message, imageInfo?.path || completedRequest?.path || '');
      return;
    }

    imgFileName.value = imageInfo.fileName;
    imgFilePath = imageInfo.path.replace(/\\/g, '/');
    imageLoadError.value = null;
    const requestedJsonImageIndex = completedRequest?.source === 'dataset' ? completedRequest.targetImageIndex : null;
    const isReady = await initProcessInfo(requestedJsonImageIndex);
    applyWorkflowTransition(
      completeOperation(
        workflowState.value,
        completedRequest.operationId,
        isReady ? WORKFLOW_PHASE.READY : WORKFLOW_PHASE.DATASET_READY,
      ),
    );
    resetImageRequestState();
    outputMessage(isReady ? 'Load Pic Successfully.' : 'Image loaded, but no matching JSON data was found.');
  } else {
    const failedPath = (response.path || '').replace(/[\\/]/g, '/');
    handleImageRequestFailure(response.error, failedPath);
  }
}

function resetImageForDatasetChange() {
  jsonHistoryByImage.clear();
  imageObj.value = null;
  imgFileName.value = '';
  imgFilePath = '';
  imageCoordinateScale.value = { x: 1, y: 1 };
  imageLoadError.value = null;
  resetImageRequestState();
  refreshImagePositionView();
  jumpImageIndex.value = '';
  resetDots();
  resetZoomPreview();
  imgContainerRef.value.clearImage();
  clearCurrentAnnotations();
}

function chooseJsonFile() {
  if (!canLoadDataset.value) {
    outputMessage('Please wait for the current operation to finish.');
    return;
  }
  const started = startDatasetLoad(workflowState.value);
  if (!applyWorkflowTransition(started)) {
    outputMessage(started.error);
    return;
  }
  try {
    ipcRenderer.send('open-json-file-dialog', { requestId: started.operationId });
  } catch (error) {
    console.error('Error while sending IPC message open-json-file-dialog:', error);
    applyWorkflowTransition(failOperation(workflowState.value, started.operationId));
  }
}

function failDatasetLoad(operationId, message = '') {
  if (message) outputMessage(message);
  applyWorkflowTransition(failOperation(workflowState.value, operationId));
}

// Dataset loading
async function handleChooseJsonFileResponse(_event, response) {
  const operationId = response?.requestId;
  if (!isCurrentOperation(workflowState.value, operationId, WORKFLOW_OPERATION.LOAD_DATASET)) return;

  if (response.canceled) {
    failDatasetLoad(operationId);
    return;
  }

  try {
    if (response.success) {
      const jsonData = response.jsonInfo;
      jsonData.path = jsonData.path.replace(/[\\/]/g, '/');
      let preparedJson = prepareJsonProcess(jsonData);
      if (!preparedJson.success) {
        failDatasetLoad(operationId, `Failed to load JSON: ${preparedJson.error}`);
        return;
      }

      if (preparedJson.requiresLossyRepair) {
        const confirmed = window.confirm(
          `${preparedJson.lossyRepairSummary}\n\nThese changes can discard original data. Continue? ` +
            'A temporary backup will be retained for 7 days and then deleted automatically.',
        );
        if (!confirmed) {
          failDatasetLoad(operationId, 'Dataset loading was canceled before any lossy repair was applied.');
          return;
        }

        preparedJson = prepareJsonProcess(jsonData, { allowLossyRepairs: true });
        if (!preparedJson.success) {
          failDatasetLoad(operationId, `Failed to repair JSON: ${preparedJson.error}`);
          return;
        }
      }

      const resolvedPathResult = await ipcRenderer.invoke('resolve-json-image-paths', {
        jsonFilePath: preparedJson.path,
        imagePaths: preparedJson.imagePaths,
      });
      if (!isCurrentOperation(workflowState.value, operationId, WORKFLOW_OPERATION.LOAD_DATASET)) return;
      if (!resolvedPathResult.success) {
        failDatasetLoad(operationId, `Failed to resolve JSON image paths: ${resolvedPathResult.error}`);
        return;
      }
      preparedJson.imagePaths = resolvedPathResult.imagePaths.map(imagePath => imagePath.replace(/[\\/]/g, '/'));

      if (preparedJson.changed) {
        if (
          !(await saveJsonFileInfo(preparedJson.fileInfo, {
            backupOriginal: preparedJson.lossyRepairsApplied,
          }))
        ) {
          failDatasetLoad(operationId);
          return;
        }
        if (!isCurrentOperation(workflowState.value, operationId, WORKFLOW_OPERATION.LOAD_DATASET)) return;
      }

      if (!commitPreparedJsonProcess(preparedJson)) {
        failDatasetLoad(operationId, 'Failed to load JSON: unable to commit the prepared dataset.');
        return;
      }
      if (!applyWorkflowTransition(commitDataset(workflowState.value, operationId))) return;

      loadedProductType.value = preparedJson.productType;
      jsonFileName.value = jsonData.fileName;
      resetImageForDatasetChange();
      selectInspectorPage(INSPECTOR_PAGE.ANNOTATION);
      if (preparedJson.repairSummary) outputMessage(preparedJson.repairSummary);

      if (preparedJson.data.Picture.length === 0) {
        outputMessage('JSON loaded successfully, but the dataset contains no valid image items.');
      } else {
        const firstImageTarget = getJsonImageTarget(0);
        if (!firstImageTarget.success) {
          outputMessage(firstImageTarget.error);
          return;
        }
        startDatasetImageRequest(firstImageTarget, KEYS.NEXT);
      }
    } else {
      const errorMessage = response.error || 'Unknown JSON loading error.';
      console.error('Failed to read JSON file:', errorMessage);
      failDatasetLoad(operationId, `Failed to read JSON file: ${errorMessage}`);
    }
  } catch (error) {
    console.error('An error occurred while processing JSON file:', error);
    failDatasetLoad(operationId, `Failed to process JSON file: ${error.message}`);
  }
}

function updateSelectedDots(newSelectedDots) {
  if (!Array.isArray(newSelectedDots)) return;
  if (canOperate.value) {
    applyPointEdit(newSelectedDots);
  } else {
    replaceSelectedDots(newSelectedDots);
    clearUndoRedoHistory(pointHistory);
  }
}

watch(selectedDots, () => {
  updateZoomView();
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

function toggleInteractionMode() {
  if (!canInteractWithImage.value) return;
  isHoverSelectMode.value = !isHoverSelectMode.value;
  outputMessage(isHoverSelectMode.value ? '鼠标已切换为悬停选择 Quad。' : '鼠标已切换为单击标点。');
}
</script>

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
  display: grid;
  grid-template-rows: 60px minmax(0, 1fr) 42px;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--surface-app);
  color: var(--text-primary);
  font-family: var(--font-ui);
}

.workspace-toolbar {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 9px 14px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-raised);
}

.app-identity {
  display: flex;
  gap: 9px;
  align-items: center;
  min-width: 172px;
  margin-right: 4px;
}

.app-mark {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  background: var(--accent);
  color: white;
  font-size: 16px;
  font-weight: 800;
  box-shadow: 0 5px 12px rgba(47, 111, 237, 0.25);
}

.app-identity div {
  display: grid;
  gap: 1px;
}

.app-identity strong {
  font-size: 14px;
  line-height: 1.2;
}

.app-identity div span {
  color: var(--text-muted);
  font-size: 10px;
}

.toolbar-group {
  display: flex;
  gap: 6px;
  align-items: center;
  padding-right: 10px;
  border-right: 1px solid var(--border-subtle);
}

.toolbar-button,
.icon-button,
.action-button {
  box-sizing: border-box;
  min-height: 32px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  background: var(--surface-raised);
  color: var(--text-primary);
  font: 600 12px/1 var(--font-ui);
  cursor: pointer;
  transition:
    border-color 120ms ease,
    background 120ms ease,
    color 120ms ease;
}

.toolbar-button {
  padding: 0 12px;
}

.toolbar-button,
.action-button {
  display: inline-flex;
  gap: 7px;
  align-items: center;
  justify-content: center;
}

.button-shortcut {
  display: inline-flex;
  gap: 2px;
  align-items: center;
}

.toolbar-button:hover:not(:disabled),
.icon-button:hover:not(:disabled),
.action-button:hover:not(:disabled) {
  border-color: #9eabc0;
  background: var(--surface-hover);
}

.toolbar-button.primary,
.action-button.primary {
  border-color: var(--accent);
  background: var(--accent);
  color: white;
}

.toolbar-button.primary:hover:not(:disabled),
.action-button.primary:hover:not(:disabled) {
  border-color: var(--accent-strong);
  background: var(--accent-strong);
}

.toolbar-button:disabled,
.icon-button:disabled,
.action-button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.toolbar-button.compact {
  min-height: 28px;
  padding: 0 9px;
}

.icon-button {
  display: inline-flex;
  gap: 5px;
  align-items: center;
  justify-content: center;
  width: 46px;
  min-height: 30px;
  padding: 0;
  font-size: 20px;
  font-weight: 400;
}

.image-position-control {
  display: flex;
  gap: 5px;
  align-items: center;
  color: var(--text-secondary);
  font-size: 11px;
  white-space: nowrap;
}

.image-position-control input {
  width: 48px;
  height: 28px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--text-primary);
  font: 12px var(--font-mono);
  text-align: center;
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
  grid-template-columns: 76px minmax(0, 1fr);
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
  min-height: 62px;
  padding: 5px 2px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  font: 600 10px/1.2 var(--font-ui);
  cursor: pointer;
}

.inspector-tab > span:not(.inspector-tab-icon) {
  max-width: 64px;
  line-height: 1.25;
}

.inspector-tab small {
  color: currentColor;
  font: 500 8px/1 var(--font-mono);
  opacity: 0.72;
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

.eyebrow {
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.panel-header h2 {
  margin: 3px 0 0;
  font-size: 19px;
  line-height: 1.2;
}

.panel-counter {
  padding: 5px 8px;
  border-radius: 99px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 10px;
}

.section-heading {
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 700;
}

.section-heading small {
  color: var(--text-muted);
  font-size: 10px;
  font-weight: 400;
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
  font-size: 10px;
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
  font: 10px/1.2 var(--font-mono);
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
  font-size: 10px;
}

.annotation-list-heading {
  align-self: end;
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

.annotation-actions .primary {
  grid-column: 1 / -1;
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

.metadata-list {
  display: grid;
  gap: 0;
  margin: 20px 0;
  border-top: 1px solid var(--border-subtle);
}

.metadata-list > div {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 12px;
  padding: 12px 2px;
  border-bottom: 1px solid var(--border-subtle);
}

.metadata-list dt {
  color: var(--text-muted);
  font-size: 11px;
}

.metadata-list dd {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--text-primary);
  font: 12px/1.3 var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dataset-actions-heading {
  margin-bottom: 9px;
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
  font-size: 12px;
}

.display-card p,
.panel-note {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 11px;
  line-height: 1.5;
}

.panel-note {
  margin-top: 16px;
  padding: 11px;
  border-radius: 7px;
  background: var(--surface-muted);
}

.workspace-statusbar {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 16px;
  align-items: center;
  min-width: 0;
  padding: 0 14px;
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-raised);
  color: var(--text-secondary);
  font-size: 10px;
  white-space: nowrap;
}

.status-context,
.shortcut-only-hints {
  display: flex;
  gap: 9px;
  align-items: center;
}

.shortcut-only-hints {
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-end;
  line-height: 17px;
}

.status-item {
  display: flex;
  gap: 6px;
  align-items: center;
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

.status-hint {
  color: var(--text-muted);
}

.shortcut-only-label {
  color: var(--accent-strong);
  font-weight: 700;
}

.toolbar-button.primary :deep(kbd),
.action-button.primary :deep(kbd) {
  border-color: rgba(255, 255, 255, 0.42);
  background: rgba(255, 255, 255, 0.12);
  color: white;
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
  font: 600 9px/1 var(--font-ui);
  vertical-align: middle;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.toast-container {
  position: fixed;
  top: 70px;
  left: 50%;
  z-index: 10000;
  display: flex;
  width: min(620px, calc(100vw - 32px));
  flex-direction: column;
  gap: 7px;
  transform: translateX(-50%);
  pointer-events: none;
}

.toast-message {
  padding: 9px 13px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 7px;
  background: rgba(28, 36, 48, 0.94);
  color: white;
  font-size: 12px;
  line-height: 1.4;
  overflow-wrap: anywhere;
  box-shadow: 0 6px 20px rgba(28, 36, 48, 0.24);
}

@media (max-width: 980px) {
  .app-identity {
    min-width: 42px;
  }

  .app-identity div {
    display: none;
  }

  .workspace-main {
    grid-template-columns: minmax(330px, 1fr) 360px;
  }
}
</style>

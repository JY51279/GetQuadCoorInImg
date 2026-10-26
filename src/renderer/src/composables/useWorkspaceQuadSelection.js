import { computed, nextTick, ref } from 'vue';
import { getAdjacentQuadIndex, normalizeQuadIndex } from '../state/QuadSelection.js';
import {
  VIEWPORT_MODE,
  VIEWPORT_MODE_EVENT,
  isQuadFocusMode,
  resolveFocusModeQuadIndex,
  transitionViewportMode,
} from '../state/QuadFocusMode.js';
import { canChangeQuadSelection } from '../state/WorkflowState.js';

export function useWorkspaceQuadSelection({
  workflowState,
  quadTotal,
  canOperate,
  canInteract,
  focusQuad,
  cancelTranslation,
  outputMessage,
  isActive = () => true,
}) {
  const activeQuadIndex = ref(-1);
  const selectionLockIndex = ref(-1);
  const viewportMode = ref(VIEWPORT_MODE.FREE);
  let focusScheduled = false;
  let disposed = false;

  const isSelectionLocked = computed(() => selectionLockIndex.value >= 0);
  const isFocusModeEnabled = computed(() => isQuadFocusMode(viewportMode.value));
  const canFocus = computed(
    () => Boolean(canInteract()) && activeQuadIndex.value >= 0 && activeQuadIndex.value < quadTotal.value,
  );
  const activeLabel = computed(() =>
    activeQuadIndex.value >= 0 ? `${activeQuadIndex.value + 1} / ${quadTotal.value}` : `— / ${quadTotal.value}`,
  );

  function scheduleFocus() {
    if (focusScheduled || !isFocusModeEnabled.value || !canFocus.value) return;
    focusScheduled = true;
    void nextTick(() => {
      focusScheduled = false;
      if (disposed || !isActive() || !isFocusModeEnabled.value || !canFocus.value) return;

      const result = focusQuad(activeQuadIndex.value);
      if (!result?.success) outputMessage(result?.error || '无法聚焦当前 Quad。');
    });
  }

  function select(newIndex, { forceFocus = false } = {}) {
    if (disposed || !canChangeQuadSelection(workflowState.value)) return false;
    const normalizedIndex = normalizeQuadIndex(newIndex, quadTotal.value);
    if (isSelectionLocked.value && normalizedIndex !== selectionLockIndex.value) return false;

    const selectionChanged = activeQuadIndex.value !== normalizedIndex;
    activeQuadIndex.value = normalizedIndex;
    if (selectionChanged || forceFocus) scheduleFocus();
    return true;
  }

  function reset() {
    if (isSelectionLocked.value) cancelTranslation('selection-reset');
    selectionLockIndex.value = -1;
    activeQuadIndex.value = -1;
  }

  function lockForTranslation(payload) {
    const quadIndex = payload?.quadIndex;
    if (!canOperate() || quadIndex !== activeQuadIndex.value) {
      cancelTranslation('selection-mismatch');
      return false;
    }
    selectionLockIndex.value = quadIndex;
    return true;
  }

  function unlockForTranslation(payload = null) {
    if (disposed || !isActive()) return false;
    const quadIndex = payload?.quadIndex;
    if (quadIndex !== undefined && quadIndex !== selectionLockIndex.value) return false;
    selectionLockIndex.value = -1;
    return true;
  }

  function selectAdjacent(direction) {
    if (!canOperate()) return false;
    return select(
      getAdjacentQuadIndex({
        activeIndex: activeQuadIndex.value,
        quadCount: quadTotal.value,
        direction,
      }),
    );
  }

  function synchronizeFocus({ forceFocus = false } = {}) {
    if (!isFocusModeEnabled.value) return false;
    return select(
      resolveFocusModeQuadIndex({
        activeIndex: activeQuadIndex.value,
        quadCount: quadTotal.value,
      }),
      { forceFocus },
    );
  }

  function toggleFocusMode() {
    if (!isFocusModeEnabled.value && !canInteract()) {
      outputMessage('请先加载一张可用图片。');
      return false;
    }

    viewportMode.value = transitionViewportMode(viewportMode.value, VIEWPORT_MODE_EVENT.TOGGLE_QUAD_FOCUS);
    if (isFocusModeEnabled.value) {
      synchronizeFocus({ forceFocus: true });
      outputMessage('已进入 Quad 聚焦模式。');
    } else {
      outputMessage('已退出 Quad 聚焦模式。');
    }
    return true;
  }

  function resetForDatasetChange() {
    viewportMode.value = transitionViewportMode(viewportMode.value, VIEWPORT_MODE_EVENT.DATASET_CHANGED);
  }

  function dispose() {
    disposed = true;
    focusScheduled = false;
  }

  return {
    activeQuadIndex,
    selectionLockIndex,
    isSelectionLocked,
    isFocusModeEnabled,
    canFocus,
    activeLabel,
    select,
    reset,
    lockForTranslation,
    unlockForTranslation,
    selectAdjacent,
    synchronizeFocus,
    toggleFocusMode,
    resetForDatasetChange,
    dispose,
  };
}

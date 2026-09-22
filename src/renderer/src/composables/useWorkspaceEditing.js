import { computed } from 'vue';
import { getBackupMessage } from '../../../shared/JsonSaveResult.js';
import { useDatasetSaveTransaction } from './useDatasetSaveTransaction.js';
import { getJsonActionLabel, useJsonHistory } from './useJsonHistory.js';
import {
  applyQuadLocationToImagesWithHistory,
  copyPreviousQuadLocationWithHistory,
  getCurrentJsonImageIndex,
  getJsonImageTarget,
  applyJsonHistoryEntriesWithReceipt,
  updateQuadPointWithHistory,
  updateJsonWithHistory,
  resolveFollowingImageIndexes,
  translateQuadWithHistory,
} from '../state/DatasetState.js';
import {
  HISTORY_DIRECTION,
  commitHistoryEntries,
  getHistoryTimeline,
  getHistoryTransition,
} from '../state/UndoRedoHistory.js';
import { imageDeltaToDatasetDelta, imagePointToDatasetPoint } from '../utils/AnnotationCoordinates.js';
import { QUAD_TRANSLATION_TARGET } from '../utils/QuadGeometry.js';
import { KEYS } from '../utils/BasicFuncs.js';

// Coordinates domain commands, persistence and history. Local UI state stays with the caller.
// View callbacks are never invoked for an in-flight save after isActive() becomes false.
export function useWorkspaceEditing({
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
  isActive,
  saveJsonFile,
  outputMessage,
  refreshCurrentAnnotations,
  clearCurrentAnnotations,
  clearCurrentImage,
  selectQuadIndex,
  unlockQuadSelectionForTranslation,
  resetDots,
  closeQuadLocationPropagation,
  onAnnotationAdded,
}) {
  const { run: executeSaveTransaction } = useDatasetSaveTransaction({
    workflowState,
    getCurrentImageIndex: getCurrentJsonImageIndex,
    saveJsonFile,
  });

  const {
    limits: jsonHistoryLimits,
    canUndo: canUndoJson,
    canRedo: canRedoJson,
    groups: jsonHistoryGroups,
    getCurrentHistory: getCurrentJsonHistory,
    recordCurrent: recordCurrentJsonHistory,
    clear: clearJsonHistory,
  } = useJsonHistory({
    canEdit: canOperate,
    currentImageIndex: computed(() => imagePositionView.value.currentIndex),
    getImageTarget: getJsonImageTarget,
    outputMessage,
  });

  // JSON Operations
  async function runSaveTransaction(mutate, onCompleted = () => {}) {
    // Persistence and rollback must settle even when the page can no longer receive UI updates.
    const result = await executeSaveTransaction(mutate);
    if (!isActive()) return false;
    if (result.rollbackFailed) {
      clearCurrentImage();
      clearCurrentAnnotations('JSON 状态不可用，请重新加载图集。');
    }
    if (result.backupPath) outputMessage(getBackupMessage(result.backupPath));
    if (result.error || result.rollbackFailed) {
      outputMessage(
        [result.error, result.rollbackFailed ? '操作失败后无法恢复 JSON 状态，请重新加载图集。' : '']
          .filter(Boolean)
          .join(' '),
      );
    }
    if (!result.success) return false;

    if (result.mutation?.historyEntry) recordCurrentJsonHistory(result.mutation.historyEntry);
    onCompleted(result);
    return true;
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
      outputMessage('拖动的 Quad 顶点已与当前标注不匹配。');
      return;
    }

    const datasetPoint = imagePointToDatasetPoint(imagePoint, imageCoordinateScale.value);
    if (datasetPoint === null) {
      refreshCurrentAnnotations({ redrawOverlay: true });
      outputMessage('无法将拖动后的点换算为数据集坐标。');
      return;
    }

    const saved = await runSaveTransaction(
      () => {
        return updateQuadPointWithHistory(quadIndex, pointIndex, datasetPoint, currentImageOriginalSize.value);
      },
      () => {
        refreshCurrentAnnotations({ redrawOverlay: true });
        selectQuadIndex(quadIndex);
        outputMessage(`已更新 Quad ${quadIndex + 1} 的顶点。`);
      },
    );

    if (!saved && isActive() && canOperate.value) refreshCurrentAnnotations({ redrawOverlay: true });
  }

  function getQuadTranslationSubject(quadIndex, target) {
    const subjectFactories = {
      [QUAD_TRANSLATION_TARGET.WHOLE]: () => `Quad ${quadIndex + 1}`,
      [QUAD_TRANSLATION_TARGET.EDGE]: () =>
        `Quad ${quadIndex + 1} 的边 P${target.edgeIndex + 1}–P${((target.edgeIndex + 1) % 4) + 1}`,
    };
    return subjectFactories[target?.type]?.() ?? `Quad ${quadIndex + 1}`;
  }

  async function commitQuadTranslation(payload) {
    const { quadIndex, target, imageDelta } = payload ?? {};
    if (!canOperate.value || quadIndex !== activeQuadIndex.value || quadIndex !== quadSelectionLockIndex.value) {
      unlockQuadSelectionForTranslation();
      refreshCurrentAnnotations({ redrawOverlay: true });
      outputMessage('拖动的 Quad 已与当前标注不匹配。');
      return;
    }

    const datasetDelta = imageDeltaToDatasetDelta(imageDelta, imageCoordinateScale.value);
    if (datasetDelta === null) {
      unlockQuadSelectionForTranslation({ quadIndex });
      refreshCurrentAnnotations({ redrawOverlay: true });
      outputMessage('无法将 Quad 位移换算为数据集坐标。');
      return;
    }

    const translationSubject = getQuadTranslationSubject(quadIndex, target);
    try {
      const saved = await runSaveTransaction(
        () => {
          return translateQuadWithHistory({
            quadIndex,
            target,
            delta: datasetDelta,
            imageSize: currentImageOriginalSize.value,
          });
        },
        result => {
          refreshCurrentAnnotations({ redrawOverlay: true });
          selectQuadIndex(quadIndex);
          resetDots();
          outputMessage(result.changed ? `已平移 ${translationSubject}。` : `${translationSubject} 的位置未改变。`);
        },
      );

      if (!saved && isActive() && canOperate.value) refreshCurrentAnnotations({ redrawOverlay: true });
    } finally {
      if (isActive()) unlockQuadSelectionForTranslation({ quadIndex });
    }
  }

  async function performJsonAction(action) {
    if (!canOperate.value) {
      outputMessage('当前图片尚未匹配数据集，不能执行 JSON 操作。');
      return;
    }

    const affectedQuadIndex = activeQuadIndex.value;
    await runSaveTransaction(
      () => {
        return updateJsonWithHistory(
          action,
          imageCoordinateScale.value,
          activeQuadIndex.value,
          selectedDots,
          currentImageOriginalSize.value,
        );
      },
      () => {
        if (action === KEYS.JSON_DELETE) {
          refreshCurrentAnnotations({ resetSelection: true, deletedQuadIndex: affectedQuadIndex });
        } else if (action === KEYS.JSON_ADD) {
          refreshCurrentAnnotations({ showNewQuad: true });
        } else {
          refreshCurrentAnnotations({ redrawOverlay: true });
        }
        if (action === KEYS.JSON_ADD) onAnnotationAdded();
        resetDots();
      },
    );
  }

  async function moveJsonHistoryTo(targetPosition, { announceTarget = false } = {}) {
    if (!canOperate.value) return;

    const history = getCurrentJsonHistory();
    const transition = getHistoryTransition(history, targetPosition);
    if (!transition.success) {
      outputMessage(transition.error);
      return;
    }
    if (transition.entries.length === 0) return;

    await runSaveTransaction(
      () => {
        return applyJsonHistoryEntriesWithReceipt(transition.entries, transition.direction);
      },
      ({ mutation }) => {
        const mutationResults = mutation.mutationResults;
        if (!commitHistoryEntries(history, transition.direction, transition.entries)) {
          outputMessage('JSON 历史状态异常，请重新加载图集。');
          return;
        }

        const finalMutation = mutationResults.at(-1);
        const indexMutations = mutationResults
          .filter(result => result.mutationType === 'insert' || result.mutationType === 'delete')
          .map(result => ({ type: result.mutationType, index: result.itemIndex }));
        const refreshOptions = {
          resetSelection: true,
          indexMutations,
          redrawOverlay: indexMutations.length === 0,
        };
        if (finalMutation.mutationType === 'insert') {
          refreshOptions.showQuadIndex = finalMutation.itemIndex;
        }
        refreshCurrentAnnotations(refreshOptions);
        selectQuadIndex(finalMutation.activeQuadIndex);

        if (announceTarget || transition.entries.length > 1) {
          const targetLabel = targetPosition === 0 ? '历史起点' : `第 ${targetPosition} 条记录`;
          outputMessage(`已回到图片 ${getCurrentJsonImageIndex() + 1} 的${targetLabel}。`);
        } else {
          const historyEntry = transition.entries[0];
          outputMessage(
            `${transition.direction === HISTORY_DIRECTION.UNDO ? '已撤销' : '已重做'}：${getJsonActionLabel(historyEntry.action)}。`,
          );
        }
      },
    );
  }

  function applyJsonHistory(direction) {
    const history = getCurrentJsonHistory();
    const { entries, currentPosition } = getHistoryTimeline(history);
    if (
      (direction === HISTORY_DIRECTION.UNDO && currentPosition === 0) ||
      (direction === HISTORY_DIRECTION.REDO && currentPosition === entries.length)
    ) {
      return;
    }
    const targetPosition = currentPosition + (direction === HISTORY_DIRECTION.UNDO ? -1 : 1);
    return moveJsonHistoryTo(targetPosition);
  }

  function jumpJsonHistory(imageIndex, targetPosition) {
    if (imageIndex !== getCurrentJsonImageIndex()) return;
    return moveJsonHistoryTo(targetPosition, { announceTarget: true });
  }

  function undoJsonEdit() {
    return applyJsonHistory(HISTORY_DIRECTION.UNDO);
  }

  function redoJsonEdit() {
    return applyJsonHistory(HISTORY_DIRECTION.REDO);
  }

  function addJsonItem() {
    return performJsonAction(KEYS.JSON_ADD);
  }

  function deleteJsonItem() {
    return performJsonAction(KEYS.JSON_DELETE);
  }

  function modifyJsonItem() {
    return performJsonAction(KEYS.JSON_MODIFY);
  }

  function formatQuadLocationPropagationSummary(quadIndex, summary) {
    const messages =
      summary.updatedCount > 0
        ? [`已将 Quad ${quadIndex + 1} 的坐标应用到 ${summary.updatedCount} 张后续图片`]
        : [`Quad ${quadIndex + 1} 没有需要应用的坐标变更`];
    if (summary.unchangedCount > 0) messages.push(`${summary.unchangedCount} 张坐标已相同`);
    if (summary.skippedImageIndexes.length > 0) {
      messages.push(`${summary.skippedImageIndexes.length} 张缺少对应 Quad，已跳过`);
    }
    return `${messages.join('；')}。`;
  }

  async function applyQuadLocationForward() {
    if (!canApplyQuadLocationForward.value) {
      closeQuadLocationPropagation();
      return;
    }

    const sourceImageIndex = imagePositionView.value.currentIndex;
    const quadIndex = activeQuadIndex.value;
    const count = quadLocationPropagationCount.value;
    const rangeResult = resolveFollowingImageIndexes({ sourceImageIndex, count });
    if (!rangeResult.success) {
      outputMessage(rangeResult.error);
      return;
    }

    closeQuadLocationPropagation();
    await runSaveTransaction(
      () => {
        return applyQuadLocationToImagesWithHistory({
          source: { imageIndex: sourceImageIndex, quadIndex },
          targetImageIndexes: rangeResult.imageIndexes,
          sourceImageSize: currentImageOriginalSize.value,
        });
      },
      ({ mutation }) => {
        if (mutation.summary) outputMessage(formatQuadLocationPropagationSummary(quadIndex, mutation.summary));
      },
    );
  }

  async function copyPreviousQuadLocation() {
    const quadIndex = activeQuadIndex.value;
    if (!canOperate.value) {
      outputMessage('当前图片尚未匹配数据集，不能沿用上一图坐标。');
      return;
    }
    if (imagePositionView.value.currentIndex <= 0) {
      outputMessage('当前图片没有上一张图片可供沿用坐标。');
      return;
    }
    if (quadIndex < 0 || quadIndex >= quadTotal.value) {
      outputMessage('请先激活一个 Quad。');
      return;
    }

    const saved = await runSaveTransaction(
      () => {
        return copyPreviousQuadLocationWithHistory(quadIndex, currentImageOriginalSize.value);
      },
      result => {
        refreshCurrentAnnotations({ redrawOverlay: true });
        selectQuadIndex(quadIndex);
        resetDots();
        outputMessage(
          result.changed
            ? `已沿用上一张图片中 Quad ${quadIndex + 1} 的坐标。`
            : `当前 Quad ${quadIndex + 1} 已与上一张图片坐标相同。`,
        );
      },
    );

    if (!saved && isActive() && canOperate.value) refreshCurrentAnnotations({ redrawOverlay: true });
  }

  return {
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
  };
}

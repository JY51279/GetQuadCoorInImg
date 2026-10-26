<template>
  <section class="inspector-page annotation-page">
    <header class="panel-header">
      <h2>Quad {{ activeQuadLabel }}</h2>
      <div class="panel-header-actions">
        <button
          class="action-button"
          :class="{ primary: isQuadFocusModeEnabled }"
          :title="isQuadFocusModeEnabled ? '退出 Quad 聚焦模式（F）' : '进入 Quad 聚焦模式（F）'"
          :disabled="!isQuadFocusModeEnabled && !canInteractWithImage"
          :aria-pressed="isQuadFocusModeEnabled"
          @click="$emit('toggle-focus-mode')"
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
          @click="$emit('undo-point')"
        >
          撤回选点
        </button>
        <button
          class="action-button history-button"
          title="重做选点（Ctrl+Y）"
          :disabled="!canRedoPoints"
          @click="$emit('redo-point')"
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
          @click="$emit('toggle-location-propagation')"
        >
          应用到后续…
        </button>
      </div>
      <form
        v-if="isQuadLocationPropagationOpen"
        id="quad-location-propagation-panel"
        class="quad-location-propagation-panel"
        @submit.prevent="$emit('apply-location-forward')"
        @keydown.esc.stop.prevent="$emit('close-location-propagation')"
      >
        <div class="propagation-panel-heading">
          <strong>应用 Quad {{ activeQuadIndex + 1 }} 的坐标</strong>
          <span>仅复制 loc，不缩放</span>
        </div>
        <label class="propagation-field">
          <span>批次张数</span>
          <span class="propagation-count-control">
            <input
              v-model.number="propagationCount"
              type="number"
              min="1"
              step="1"
              :disabled="!canOperate"
              aria-label="应用到后续图片的张数"
            />
            <small> 本次 {{ effectivePropagationCount }} / 剩余 {{ remainingFollowingImageCount }} 张 </small>
          </span>
        </label>
        <div class="propagation-panel-actions">
          <button type="button" class="action-button" @click="$emit('close-location-propagation')">取消</button>
          <button type="submit" class="action-button primary" :disabled="!canSubmitLocationPropagation">应用</button>
        </div>
      </form>
    </div>

    <JsonView
      ref="jsonView"
      class="annotation-list"
      :active-quad-index="activeQuadIndex"
      :formatted-items="annotationView.formattedItems"
      :error-message="annotationView.errorMessage"
      @select-quad-index="$emit('select-quad-index', $event)"
    />

    <div class="json-history-actions">
      <button
        class="action-button history-button"
        title="撤销 JSON 操作（Ctrl+Shift+Z）"
        :disabled="!canUndoJson"
        @click="$emit('undo-json')"
      >
        撤销 JSON
      </button>
      <button
        class="action-button history-button"
        title="重做 JSON 操作（Ctrl+Shift+Y）"
        :disabled="!canRedoJson"
        @click="$emit('redo-json')"
      >
        重做 JSON
      </button>
    </div>

    <div class="annotation-actions">
      <button
        class="action-button copy-location-button"
        :disabled="!canCopyPreviousQuadLocation"
        title="将上一张图片中同下标 Quad 的坐标复制到当前 Quad（Ctrl+E）"
        @click="$emit('copy-previous-location')"
      >
        沿用上图坐标
      </button>
      <button
        class="action-button primary"
        title="更新当前 Quad（Ctrl+S）"
        :disabled="!canOperate"
        @click="$emit('modify-quad')"
      >
        更新
      </button>
      <button class="action-button" title="新增 Quad（Ctrl+A）" :disabled="!canOperate" @click="$emit('add-quad')">
        新增
      </button>
      <button
        class="action-button danger"
        title="删除当前 Quad（Ctrl+D）"
        :disabled="!canOperate"
        @click="$emit('delete-quad')"
      >
        删除
      </button>
    </div>
  </section>
</template>

<script setup>
import { computed, ref } from 'vue';
import JsonView from './JsonView.vue';

const props = defineProps({
  activeQuadIndex: { type: Number, default: -1 },
  activeQuadLabel: { type: String, default: '— / 0' },
  annotationView: {
    type: Object,
    default: () => ({ formattedItems: [], errorMessage: '' }),
  },
  selectedDots: { type: Array, default: () => [] },
  isQuadFocusModeEnabled: { type: Boolean, default: false },
  canInteractWithImage: { type: Boolean, default: false },
  canUndoPoints: { type: Boolean, default: false },
  canRedoPoints: { type: Boolean, default: false },
  canApplyQuadLocationForward: { type: Boolean, default: false },
  isQuadLocationPropagationOpen: { type: Boolean, default: false },
  quadLocationPropagationCount: { type: Number, default: 0 },
  effectivePropagationCount: { type: Number, default: 0 },
  remainingFollowingImageCount: { type: Number, default: 0 },
  canSubmitLocationPropagation: { type: Boolean, default: false },
  canUndoJson: { type: Boolean, default: false },
  canRedoJson: { type: Boolean, default: false },
  canCopyPreviousQuadLocation: { type: Boolean, default: false },
  canOperate: { type: Boolean, default: false },
});
const emit = defineEmits([
  'toggle-focus-mode',
  'undo-point',
  'redo-point',
  'toggle-location-propagation',
  'close-location-propagation',
  'apply-location-forward',
  'update:quadLocationPropagationCount',
  'select-quad-index',
  'undo-json',
  'redo-json',
  'copy-previous-location',
  'modify-quad',
  'add-quad',
  'delete-quad',
]);

const zoomView = ref(null);
const jsonView = ref(null);
const propagationCount = computed({
  get: () => props.quadLocationPropagationCount,
  set: value => emit('update:quadLocationPropagationCount', value),
});

function getZoomCanvas() {
  return zoomView.value;
}

function scrollToBottom() {
  return jsonView.value?.scrollToBottom();
}

defineExpose({
  getZoomCanvas,
  scrollToBottom,
});
</script>

<style scoped src="../assets/workspace-controls.css"></style>
<style scoped>
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

.annotation-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 7px;
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
</style>

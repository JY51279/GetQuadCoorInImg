<template>
  <header class="workspace-toolbar">
    <div class="app-identity" aria-label="QuadTool">
      <span class="app-mark">Q</span>
      <div>
        <strong>QuadTool</strong>
        <span>像素级四边形标注</span>
      </div>
    </div>

    <div class="toolbar-group toolbar-files">
      <button
        class="toolbar-button primary"
        :title="datasetOpenTitle"
        :disabled="!canLoadDataset"
        @click="emit('open-dataset')"
      >
        打开图集
      </button>
      <button
        class="toolbar-button compact"
        :title="previousDatasetTitle"
        :disabled="!canNavigateDataset"
        @click="emit('navigate-dataset', KEYS.PREVIOUS)"
      >
        上一图集
      </button>
      <button
        class="toolbar-button compact"
        :title="nextDatasetTitle"
        :disabled="!canNavigateDataset"
        @click="emit('navigate-dataset', KEYS.NEXT)"
      >
        下一图集
      </button>
      <button
        class="toolbar-button"
        title="手动匹配图片（Ctrl+I）"
        :disabled="imagePositionView.total === 0 || !canLoadImage"
        @click="emit('match-image')"
      >
        匹配图片
      </button>
      <div
        class="toolbar-dataset-name"
        :title="jsonFileName || '未加载图集'"
        :aria-label="`当前图集：${jsonFileName || '未加载'}`"
        aria-live="polite"
      >
        <span>图集：</span>
        <strong>{{ jsonFileName || '未加载' }}</strong>
      </div>
    </div>

    <div class="toolbar-group image-navigation" aria-label="图片导航">
      <button
        class="icon-button"
        title="上一张图片（A / ←）"
        :disabled="imagePositionView.total === 0 || !canLoadImage"
        @click="emit('navigate-image', KEYS.PREVIOUS)"
      >
        <span aria-hidden="true">‹</span>
      </button>
      <label class="image-position-control">
        <span class="sr-only">图片序号</span>
        <input
          v-model="jumpValue"
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
        @click="emit('navigate-image', KEYS.NEXT)"
      >
        <span aria-hidden="true">›</span>
      </button>
      <button
        class="toolbar-button compact"
        title="跳转到输入的图片序号（Enter）"
        :disabled="imagePositionView.total === 0 || !canLoadImage"
        @click="emit('jump-image')"
      >
        跳转
      </button>
    </div>
  </header>
</template>

<script setup>
import { computed } from 'vue';
import { KEYS } from '../utils/BasicFuncs.js';
import { getWorkspaceShortcutTitle } from '../shortcuts/WorkspaceShortcuts.js';

const props = defineProps({
  canLoadDataset: Boolean,
  canNavigateDataset: Boolean,
  canLoadImage: Boolean,
  imagePositionView: { type: Object, required: true },
  jsonFileName: { type: String, default: '' },
  jumpImageIndex: { type: [String, Number], default: '' },
});
const emit = defineEmits([
  'open-dataset',
  'navigate-dataset',
  'match-image',
  'navigate-image',
  'jump-image',
  'update:jumpImageIndex',
]);
const jumpValue = computed({
  get: () => props.jumpImageIndex,
  set: value => emit('update:jumpImageIndex', value),
});
const datasetOpenTitle = getWorkspaceShortcutTitle('dataset.open');
const previousDatasetTitle = getWorkspaceShortcutTitle('dataset.previous');
const nextDatasetTitle = getWorkspaceShortcutTitle('dataset.next');
function handleJumpToImageIndexKeyDown(event) {
  if (!event.repeat) emit('jump-image');
}
</script>

<style scoped src="../assets/workspace-controls.css"></style>
<style scoped>
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
  font-size: var(--font-size-caption);
}

.toolbar-group {
  display: flex;
  gap: 6px;
  align-items: center;
  padding-right: 10px;
  border-right: 1px solid var(--border-subtle);
}

.toolbar-files {
  min-width: 0;
}

.toolbar-files .toolbar-button {
  flex: 0 0 auto;
}

.toolbar-dataset-name {
  display: flex;
  width: clamp(120px, 18vw, 220px);
  min-width: 0;
  align-items: center;
  color: var(--text-secondary);
  font-size: var(--font-size-secondary);
  white-space: nowrap;
}

.toolbar-dataset-name span {
  flex: 0 0 auto;
}

.toolbar-dataset-name strong {
  min-width: 0;
  overflow: hidden;
  color: var(--text-primary);
  font-weight: 600;
  text-overflow: ellipsis;
}

.toolbar-button {
  padding: 0 12px;
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
  font-size: var(--font-size-secondary);
  white-space: nowrap;
}

.image-position-control input {
  width: 48px;
  height: 28px;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  background: var(--surface-muted);
  color: var(--text-primary);
  font: var(--font-size-code) var(--font-mono);
  text-align: center;
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

@media (max-width: 980px) {
  .app-identity {
    min-width: 42px;
  }
  .app-identity div {
    display: none;
  }
}
</style>

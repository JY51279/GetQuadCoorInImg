<template>
  <section class="inspector-page">
    <header class="panel-header">
      <h2>视图与鼠标操作</h2>
    </header>
    <div class="display-card">
      <div>
        <strong>鼠标当前行为</strong>
        <p>{{ interactionDescription }}</p>
      </div>
      <button
        class="action-button direct-edit-mode-button"
        :class="{ active: isDirectQuadEditingEnabled }"
        :title="isDirectQuadEditingEnabled ? '返回默认观察模式（Tab）' : '进入直接编辑模式（Tab）'"
        :disabled="!canInteractWithImage"
        :aria-pressed="isDirectQuadEditingEnabled"
        @click="$emit('toggle-quad-interaction')"
      >
        {{ isDirectQuadEditingEnabled ? '返回默认模式' : '进入直接编辑' }}
      </button>
    </div>
    <div class="stacked-actions">
      <button
        class="action-button"
        title="重置图片位置（R）"
        :disabled="!canInteractWithImage"
        @click="$emit('reset-position')"
      >
        重置图片位置
      </button>
      <button
        class="action-button"
        title="切换当前 Quad 显示（Q）"
        :disabled="!canFocusQuad"
        @click="$emit('toggle-active-quad-visibility')"
      >
        切换当前 Quad 显示
      </button>
      <button
        class="action-button"
        title="显示全部 Quad（Ctrl+Shift+Q）"
        :disabled="!canInteractWithImage || !hasQuads"
        @click="$emit('show-all-quads')"
      >
        显示全部 Quad
      </button>
      <button
        class="action-button"
        title="隐藏全部 Quad（Ctrl+Q）"
        :disabled="!canInteractWithImage"
        @click="$emit('hide-all-quads')"
      >
        隐藏全部 Quad
      </button>
    </div>
    <p class="panel-note">放大到像素网格后，深色描边框表示鼠标当前对应的单个像素。</p>
  </section>
</template>

<script setup>
import { computed } from 'vue';

const props = defineProps({
  isDirectQuadEditingEnabled: { type: Boolean, default: false },
  canInteractWithImage: { type: Boolean, default: false },
  canFocusQuad: { type: Boolean, default: false },
  hasQuads: { type: Boolean, default: false },
});

defineEmits([
  'toggle-quad-interaction',
  'reset-position',
  'toggle-active-quad-visibility',
  'show-all-quads',
  'hide-all-quads',
]);

const interactionDescription = computed(() =>
  props.isDirectQuadEditingEnabled ? '悬停选择 Quad；可拖动 Quad 或顶点' : '观察 Quad；通过选点更新标注',
);
</script>

<style scoped src="../assets/workspace-controls.css"></style>
<style scoped>
.panel-header {
  display: flex;
  min-height: 42px;
  justify-content: space-between;
  align-items: center;
}

.panel-header h2 {
  margin: 0;
  font-size: 19px;
  line-height: 1.2;
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

.stacked-actions {
  display: grid;
  grid-template-columns: 1fr;
  gap: 7px;
}

.action-button {
  padding: 0 10px;
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

.panel-note {
  margin-top: 16px;
  padding: 11px;
  border-radius: 7px;
  background: var(--surface-muted);
}
</style>

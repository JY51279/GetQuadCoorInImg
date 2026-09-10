<template>
  <div class="history-view">
    <p v-if="groups.length === 0" class="history-empty">加载并编辑图片后，JSON 操作记录会显示在这里。</p>

    <section
      v-for="group in groups"
      :key="group.imageIndex"
      class="history-group"
      :class="{ current: group.isCurrent }"
    >
      <header class="history-group-header">
        <div>
          <strong>{{ group.label }}</strong>
          <small :title="group.fileName">{{ group.fileName }}</small>
        </div>
        <span class="history-group-state">{{ group.isCurrent ? '当前图片' : '不可跳转' }}</span>
      </header>

      <p v-if="group.recordCount === 0" class="history-group-empty">当前图片尚无 JSON 操作记录。</p>
      <ol v-else class="history-list">
        <li v-for="row in group.rows" :key="row.key">
          <button
            type="button"
            class="history-row"
            :class="row.state"
            :disabled="!row.canJump"
            @click="$emit('jump-history', group.imageIndex, row.targetPosition)"
          >
            <span class="history-sequence">{{ row.targetPosition === 0 ? '起点' : row.targetPosition }}</span>
            <span class="history-entry-info">
              <span class="history-label">{{ row.label }}</span>
              <time v-if="row.timestampLabel" :datetime="row.recordedAt" :title="row.recordedAt">
                {{ row.timestampLabel }}
              </time>
            </span>
            <small>{{ row.stateLabel }}</small>
          </button>
        </li>
      </ol>
    </section>
  </div>
</template>

<script setup>
defineProps({
  groups: {
    type: Array,
    default: () => [],
  },
});

defineEmits(['jump-history']);
</script>

<style scoped>
.history-view {
  display: grid;
  gap: 12px;
}

.history-empty,
.history-group-empty {
  margin: 0;
  color: var(--text-muted);
  font-size: 11px;
  line-height: 1.5;
}

.history-empty {
  padding: 20px 14px;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  text-align: center;
}

.history-group {
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-raised);
}

.history-group.current {
  border-color: #b9caf2;
}

.history-group-header {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  padding: 10px 11px;
  border-bottom: 1px solid var(--border-subtle);
  background: var(--surface-muted);
}

.history-group-header > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}

.history-group-header strong,
.history-group-header small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-group-header strong {
  color: var(--text-primary);
  font-size: 12px;
}

.history-group-header small {
  color: var(--text-muted);
  font: 9px/1.2 var(--font-mono);
}

.history-group-state {
  flex: none;
  padding: 4px 7px;
  border-radius: 99px;
  background: var(--surface-raised);
  color: var(--text-muted);
  font-size: 9px;
}

.current .history-group-state {
  background: var(--accent-soft);
  color: var(--accent-strong);
}

.history-group-empty {
  padding: 12px;
}

.history-list {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 5px;
  list-style: none;
}

.history-row {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-height: 34px;
  padding: 5px 7px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text-primary);
  font: 500 11px/1.3 var(--font-ui);
  text-align: left;
  cursor: pointer;
}

.history-row:hover:not(:disabled) {
  background: var(--surface-hover);
}

.history-row:disabled {
  cursor: default;
}

.history-row.future {
  color: var(--text-muted);
}

.history-row.current {
  background: var(--accent-soft);
  color: var(--accent-strong);
  font-weight: 700;
}

.history-group:not(.current) .history-row {
  opacity: 0.58;
}

.history-sequence {
  color: var(--text-muted);
  font: 9px/1 var(--font-mono);
  text-align: center;
}

.history-entry-info {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.history-label {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-entry-info time {
  color: var(--text-muted);
  font: 9px/1 var(--font-mono);
}

.history-row small {
  color: currentColor;
  font-size: 9px;
  opacity: 0.72;
}
</style>

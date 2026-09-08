<template>
  <div ref="jsonContainer" class="json-container">
    <div v-if="formattedItems.length" class="json-list" role="listbox" aria-label="Quad 标注列表">
      <button
        v-for="(jsonItem, index) in formattedItems"
        :key="index"
        type="button"
        role="option"
        :data-json-index="index"
        :aria-selected="index === activeQuadIndex"
        :class="{ active: index === activeQuadIndex }"
        class="json-item-container"
        @mouseenter="selectQuadIndex(index)"
        @click="selectQuadIndex(index)"
      >
        <span class="json-index">{{ index + 1 }}</span>
        <code>{{ jsonItem }}</code>
      </button>
    </div>
    <div v-else-if="!errorMessage" class="json-empty">当前图片没有 Quad 标注</div>
    <div v-if="errorMessage" class="json-error-overlay">
      <div class="json-error-content">{{ errorMessage }}</div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';

defineExpose({
  scrollToBottom,
});
const props = defineProps({
  activeQuadIndex: {
    type: Number,
    default: -1,
  },
  formattedItems: {
    type: Array,
    default: () => [],
  },
  errorMessage: {
    type: String,
    default: '',
  },
});
const emits = defineEmits(['select-quad-index']);

const jsonContainer = ref(null);

watch(
  () => props.activeQuadIndex,
  (newIndex, oldIndex) => {
    if (oldIndex === newIndex) return;
    if (newIndex > -1 && newIndex < props.formattedItems.length) {
      ensureHighlightVisible();
    }
  },
);
function selectQuadIndex(newIndex) {
  const normalizedIndex =
    Number.isInteger(newIndex) && newIndex >= 0 && newIndex < props.formattedItems.length ? newIndex : -1;
  emits('select-quad-index', normalizedIndex);
}

async function ensureHighlightVisible() {
  await nextTick();

  const container = jsonContainer.value;
  if (!container || props.activeQuadIndex < 0) return;

  const highlightedItem = container.querySelector(`[data-json-index="${props.activeQuadIndex}"]`);
  if (!highlightedItem) return;

  const containerRect = container.getBoundingClientRect();
  const itemRect = highlightedItem.getBoundingClientRect();
  if (itemRect.top < containerRect.top) {
    container.scrollTop -= containerRect.top - itemRect.top;
  } else if (itemRect.bottom > containerRect.bottom) {
    container.scrollTop += itemRect.bottom - containerRect.bottom;
  }
}

async function scrollToBottom() {
  await nextTick();

  const container = jsonContainer.value;
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}
</script>

<style scoped>
.json-container {
  position: relative;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
  background: var(--surface-muted);
}

.json-list {
  display: grid;
  gap: 4px;
  padding: 6px;
}

.json-item-container {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
  width: 100%;
  padding: 8px;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
}

.json-item-container:hover {
  background: var(--surface-hover);
}

.json-item-container.active {
  border-color: color-mix(in srgb, var(--accent) 38%, transparent);
  background: var(--accent-soft);
  color: var(--text-primary);
}

.json-index {
  display: grid;
  place-items: center;
  min-height: 20px;
  border-radius: 5px;
  background: var(--surface-raised);
  color: var(--text-muted);
  font: 600 10px/1 var(--font-ui);
}

.json-item-container.active .json-index {
  background: var(--accent);
  color: white;
}

.json-item-container code {
  min-width: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font: 11px/1.45 var(--font-mono);
}

.json-empty,
.json-error-overlay {
  display: grid;
  min-height: 140px;
  place-items: center;
  box-sizing: border-box;
  padding: 24px;
  color: var(--text-muted);
  font-size: 12px;
  text-align: center;
}

.json-error-overlay {
  position: absolute;
  inset: 0;
  background: color-mix(in srgb, var(--surface-raised) 92%, transparent);
  color: var(--danger);
}

.json-error-content {
  line-height: 1.5;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>

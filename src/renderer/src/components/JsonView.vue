<template>
  <div ref="jsonContainer" class="json-container">
    <pre class="json-all-container">
      <div
      v-for="(jsonItem, index) in formattedJsonStrArray"
      :key="index"
      :data-json-index="index"
      :class="{ 'highlighted-line': index === activeQuadIndex }"
      class="json-item-container"
      @mouseenter="selectQuadIndex(index)"
    >
      <span>{{ jsonItem }}</span>
    </div></pre>
    <div v-if="hasPicJsonFailedFetched" class="loading-overlay">
      <div class="json-error-content">{{ picJsonErrorMessage }}</div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue';
import { getJsonPerPicStrArray, resetPicJson } from '../state/DatasetState.js';
import { KEYS } from '../utils/BasicFuncs.js';
// eslint-disable-next-line no-unused-vars

defineExpose({
  //暴露想要传递的值或方法
  updateLightIndex,
  initJsonInfo,
  modifyJsonItem,
  deleteJsonItem,
  addJsonItem,
});
const props = defineProps({
  activeQuadIndex: {
    type: Number,
    default: -1,
  },
});
const emits = defineEmits(['select-quad-index', 'update-quad-total', 'init-show-quads']);

let jsonPerPicArray = [];
const formattedJsonStrArray = ref([]);
const jsonContainer = ref(null);

watch(
  () => props.activeQuadIndex,
  (newIndex, oldIndex) => {
    if (oldIndex === newIndex) return;
    if (newIndex > -1 && newIndex < jsonPerPicArray.length) {
      ensureHighlightVisible();
    }
  },
);
function selectQuadIndex(newIndex) {
  const normalizedIndex =
    Number.isInteger(newIndex) && newIndex >= 0 && newIndex < jsonPerPicArray.length ? newIndex : -1;
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
function modifyJsonItem() {
  updateJsonPerPicArray();
}
function deleteJsonItem() {
  updateJsonPerPicArray();
  //scrollToBottom();
}
function addJsonItem() {
  updateJsonPerPicArray();
  scrollToBottom();
}

function updateLightIndex(direction) {
  if (direction === KEYS.NEXT) {
    selectQuadIndex(Math.min(props.activeQuadIndex + 1, jsonPerPicArray.length));
  } else if (direction === KEYS.PREVIOUS) {
    selectQuadIndex(Math.max(props.activeQuadIndex - 1, -1));
  }
}
function updateJsonPerPicArray() {
  formattedJsonStrArray.value = getJsonPerPicStrArray();
  const jsonArrayTmp = [];
  for (let i = 0; i < formattedJsonStrArray.value.length; i++)
    jsonArrayTmp.push(JSON.parse(formattedJsonStrArray.value[i]));
  jsonPerPicArray = jsonArrayTmp;
  emits('update-quad-total', jsonPerPicArray.length);
  emits('select-quad-index', -1);
  emits('init-show-quads');
}

const hasPicJsonFailedFetched = ref(false);
const picJsonErrorMessage = ref('');
function initJsonInfo(imgFilePath, jsonImageIndex = null) {
  if (!resetPicJson(imgFilePath, jsonImageIndex)) {
    formattedJsonStrArray.value = [];
    jsonPerPicArray = [];
    hasPicJsonFailedFetched.value = true;
    picJsonErrorMessage.value = imgFilePath
      ? `No JSON data found for image path:\n${imgFilePath}`
      : 'No JSON data found for the current image.';
    emits('update-quad-total', 0);
    emits('select-quad-index', -1);
    emits('init-show-quads');
    return false;
  }

  hasPicJsonFailedFetched.value = false;
  picJsonErrorMessage.value = '';

  updateJsonPerPicArray();
  return true;
}
</script>

<style scoped>
.json-container {
  position: relative;
  width: calc(25%);
  /*20*2 + 120 + 2((1)*2) + 4(blankSpace)*/
  height: calc(100%);
  margin-left: auto;
  overflow: auto;
  border: 2px solid gray;
}
.json-all-container {
  display: inline-flex; /* 或者 display: inline-flex; */
  flex-direction: column;
}
.highlighted-line {
  background-color: #ffff006b; /* Yellow color with some transparency */
}
.json-item-container {
  display: inline-flex; /* 或者 display: inline-flex; */
}

.loading-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  color: white;
  display: flex;
  justify-content: center;
  align-items: center;
  box-sizing: border-box;
  padding: 24px;
  text-align: center;
}

.json-error-content {
  max-width: 100%;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}
</style>

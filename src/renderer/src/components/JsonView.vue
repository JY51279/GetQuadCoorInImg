<template>
  <div ref="jsonContainer" class="json-container">
    <pre class="json-all-container">
      <div
      v-for="(jsonItem, index) in formattedJsonStrArray"
      :key="index"
      :data-json-index="index"
      :class="{ 'highlighted-line': index === highlightedIndex }"
      class="json-item-container"
      @mouseenter="updateHighlightedIndex(index)"
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
  updateHighlightedIndex,
});
const emits = defineEmits(['update-quad-info', 'init-show-quads']);

let jsonPerPicArray = [];
const formattedJsonStrArray = ref([]);
const jsonContainer = ref(null);

const highlightedIndex = ref(-1);
watch(highlightedIndex, (newIndex, oldIndex) => {
  if (oldIndex === newIndex) return;
  if (newIndex > -1 && newIndex < jsonPerPicArray.length) {
    ensureHighlightVisible();
    emits('update-quad-info', newIndex + 1);
  } else {
    emits('update-quad-info', 0);
  }
});
function updateHighlightedIndex(newIndex) {
  highlightedIndex.value = Math.min(jsonPerPicArray.length - 1, Math.max(-1, newIndex));
}

async function ensureHighlightVisible() {
  await nextTick();

  const container = jsonContainer.value;
  if (!container || highlightedIndex.value < 0) return;

  const highlightedItem = container.querySelector(`[data-json-index="${highlightedIndex.value}"]`);
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
  highlightedIndex.value = Math.min(highlightedIndex.value, jsonPerPicArray.length - 1);
  //scrollToBottom();
}
function addJsonItem() {
  updateJsonPerPicArray();
  highlightedIndex.value = -1;
  scrollToBottom();
}

function updateLightIndex(direction) {
  if (direction === KEYS.NEXT) {
    highlightedIndex.value = Math.min(highlightedIndex.value + 1, jsonPerPicArray.length);
  } else if (direction === KEYS.PREVIOUS) {
    highlightedIndex.value = Math.max(highlightedIndex.value - 1, -1);
  }
}
function updateJsonPerPicArray() {
  formattedJsonStrArray.value = getJsonPerPicStrArray();
  const jsonArrayTmp = [];
  for (let i = 0; i < formattedJsonStrArray.value.length; i++)
    jsonArrayTmp.push(JSON.parse(formattedJsonStrArray.value[i]));
  jsonPerPicArray = jsonArrayTmp;
  emits('update-quad-info', -1, jsonPerPicArray.length);
  emits('init-show-quads');
  highlightedIndex.value = -1;
}

const hasPicJsonFailedFetched = ref(false);
const picJsonErrorMessage = ref('');
function initJsonInfo(imgFilePath, jsonImageIndex = null) {
  if (!resetPicJson(imgFilePath, jsonImageIndex)) {
    formattedJsonStrArray.value = [];
    jsonPerPicArray = [];
    highlightedIndex.value = -1;
    hasPicJsonFailedFetched.value = true;
    picJsonErrorMessage.value = imgFilePath
      ? `No JSON data found for image path:\n${imgFilePath}`
      : 'No JSON data found for the current image.';
    emits('update-quad-info', -1, 0);
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

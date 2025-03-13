<template>
  <div class="json-container" @mousemove="highlightLine($event, $refs.jsonView)">
    <pre ref="jsonView" class="json-all-container">
      <div
      v-for="(jsonItem, index) in formattedJsonStrArray"
      :key="index"
      :class="{ 'highlighted-line': index === highlightedIndex }"
      class="json-item-container"
    >
      <span>{{ jsonItem }}</span>
    </div></pre>
    <div v-if="hasPicJsonFailedFetched" class="loading-overlay">
      Failed to get image data.<br />
      Please check the input files and ensure the selected product type is correct.<br />
      Then, try again.
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { getJsonPerPicStrArray, getJsonPerPicPerObjKeysNum, resetPicJson } from '../utils/JsonProcess.js';
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
let jsonPerObjLineNum = -1;
const formattedJsonStrArray = ref('');

let lineHeight = 0;
const jsonView = ref(null);

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

function highlightLine(e, preElement) {
  if (jsonPerObjLineNum === -1) return;
  // 计算滚动区域中不可见的部分的高度
  const invisibleHeight = preElement.scrollTop;
  // 当前鼠标相对于滚动容器的 Y 方向偏移量
  const rect = preElement.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;
  // 计算当前鼠标所在的行数
  const hoveredLine = Math.floor((invisibleHeight + offsetY) / lineHeight);
  // 计算对应的元素下标
  updateHighlightedIndex(Math.floor(hoveredLine / jsonPerObjLineNum));
}

function ensureHighlightVisible() {
  const container = document.querySelector('.json-container');
  const containerRect = container.getBoundingClientRect();

  const objHeight = jsonPerObjLineNum * lineHeight;
  const highlightedLineOffset = highlightedIndex.value * objHeight + lineHeight;
  const scrollBottom = container.scrollTop + containerRect.height - objHeight - lineHeight; // - lineHeight cause the verScroll
  if (highlightedLineOffset < container.scrollTop) {
    // 如果高亮部分在可视内容之前，向上滚动
    container.scrollBy(0, highlightedLineOffset - container.scrollTop);
  } else if (highlightedLineOffset > scrollBottom) {
    // 如果高亮部分在可视内容之后，向下滚动
    container.scrollBy(0, highlightedLineOffset - scrollBottom);
  }
}

function scrollToBottom() {
  const container = document.querySelector('.json-container');
  if (container) {
    container.scrollTop = container.scrollHeight - container.clientHeight;
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
function updateHighlightInfo() {
  //updateLineHeight
  if (jsonView.value !== null) {
    const preElement = jsonView.value;
    const computedStyle = getComputedStyle(preElement);
    lineHeight = parseFloat(computedStyle.lineHeight);
  }
  jsonPerObjLineNum = getJsonPerPicPerObjKeysNum() + 2; // Add "{"  "}" 2 line
  highlightedIndex.value = -1;
}
function updateJsonPerPicArray() {
  formattedJsonStrArray.value = getJsonPerPicStrArray();
  const jsonArrayTmp = [];
  for (let i = 0; i < formattedJsonStrArray.value.length; i++)
    jsonArrayTmp.push(JSON.parse(formattedJsonStrArray.value[i]));
  jsonPerPicArray = jsonArrayTmp;
  emits('update-quad-info', -1, jsonPerPicArray.length);
  emits('init-show-quads');
  updateHighlightInfo();
}

const hasPicJsonFailedFetched = ref(false);
function initJsonInfo(imgFilePath, direction = '') {
  if (!resetPicJson(imgFilePath, direction)) hasPicJsonFailedFetched.value = true;
  else hasPicJsonFailedFetched.value = false;

  updateJsonPerPicArray();
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
}
</style>

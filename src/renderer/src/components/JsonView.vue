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
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';
import { getJsonPerPicStrArray, getJsonPerPicPerObjKeysNum } from '../utils/JsonProcess.js';
import { KEYS } from '../utils/BasicFuncs.js';
// eslint-disable-next-line no-unused-vars

defineExpose({
  //暴露想要传递的值或方法
  updateLightIndex,
  updateJsonView,
  modifyJsonItem,
  deleteJsonItem,
});
const emits = defineEmits(['update-quad-info']);

const highlightedJson = ref(null);
let jsonPerPicArray = [];
let jsonPerObjLineNum = -1;
const formattedJsonStrArray = ref('');

let lineHeight = 0;
const jsonView = ref(null);

const highlightedIndex = ref(-1);
watch(highlightedIndex, newIndex => {
  if (newIndex > -1 && newIndex < jsonPerPicArray.length) {
    ensureHighlightVisible();
    emits('update-quad-info', newIndex + 1);
  } else {
    emits('update-quad-info', 0);
  }
});

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
  highlightedIndex.value = Math.min(
    jsonPerPicArray.length - 1,
    Math.max(0, Math.floor(hoveredLine / jsonPerObjLineNum)),
  );

  highlightedJson.value = jsonPerPicArray[highlightedIndex.value];
}

function ensureHighlightVisible() {
  const container = document.querySelector('.json-container');
  const containerRect = container.getBoundingClientRect();

  const objHeight = jsonPerObjLineNum * lineHeight;
  const highlightedLineOffset = highlightedIndex.value * objHeight + lineHeight;
  const scrollBottom = container.scrollTop + containerRect.height - objHeight - lineHeight; // - lineHeight cause the verScroll
  console.log(objHeight);
  console.log(lineHeight);
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
  updateJson();
}
//TODO 完善delete相关功能
function deleteJsonItem() {
  updateJsonView();
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
  highlightedJson.value = null;
}
function updateJson() {
  formattedJsonStrArray.value = getJsonPerPicStrArray();
  const jsonArrayTmp = [];
  for (let i = 0; i < formattedJsonStrArray.value.length; i++)
    jsonArrayTmp.push(JSON.parse(formattedJsonStrArray.value[i]));
  jsonPerPicArray = jsonArrayTmp;
}
function updateJsonView() {
  updateJson();
  updateHighlightInfo();
  emits('update-quad-info', -1, jsonPerPicArray.length);
}
</script>

<style scoped>
.json-container {
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
</style>
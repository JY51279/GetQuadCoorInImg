<template>
  <img class="helpIcon" src="../assets/help_outline_black_24dp.svg" @click="isShow = !isShow" />

  <div
    v-if="isShow"
    class="helpContainer"
    :style="`transform: translate(${offsetX}px, ${offsetY}px);
                  transform-origin: 0% 0%;
                  `"
    @mousedown="dragStart"
    @mousemove="drag"
    @mouseup="dragEnd"
    @mouseleave="dragEnd"
  >
    <img class="closeIcon" src="../assets/close_black_24dp.svg" @click="isShow = false" />

    <div class="keyCombination">
      <div class="key">w</div>
      <div style="margin-left: 1px">/</div>
      <div class="key">↑</div>
      <div class="keyText">上一个Json项</div>
    </div>

    <div class="keyCombination">
      <div class="key">s</div>
      <div style="margin-left: 1px">/</div>
      <div class="key">↓</div>
      <div class="keyText">下一个Json项</div>
    </div>

    <div class="keyCombination">
      <div class="key">a</div>
      <div style="margin-left: 1px">/</div>
      <div class="key">←</div>
      <div class="keyText">上一张图片</div>
    </div>

    <div class="keyCombination">
      <div class="key">d</div>
      <div style="margin-left: 1px">/</div>
      <div class="key">→</div>
      <div class="keyText">下一张图片</div>
    </div>

    <div class="keyCombination">
      <div class="key">Ctrl</div>
      <div class="key">s</div>
      <div class="keyText">修改高亮Json项</div>
    </div>

    <div class="keyCombination">
      <div class="key">Ctrl</div>
      <div class="key">d</div>
      <div class="keyText">删除高亮Json项</div>
    </div>

    <div class="keyCombination">
      <div class="key">Ctrl</div>
      <div class="key">a</div>
      <div class="keyText">添加高亮Json项(DDN)</div>
    </div>

    <div class="keyCombination">
      <div class="key">c</div>
      <div class="keyText">清空信息</div>
    </div>

    <div class="keyCombination">
      <div class="key">Ctrl</div>
      <div class="key">c</div>
      <div class="keyText">清空标点</div>
    </div>

    <div class="keyCombination">
      <div class="key">Ctrl</div>
      <div class="key">r</div>
      <div class="keyText">重置图片位置</div>
    </div>

    <div class="keyCombination">
      <div class="key">q</div>
      <div class="keyText">高亮四边形是/否显示</div>
    </div>

    <div class="keyCombination">
      <div class="key">Ctrl</div>
      <div class="key">q</div>
      <div class="keyText">清空显示的四边形</div>
    </div>

    <div class="keyCombination">
      <div class="key">Ctrl</div>
      <div class="key">Shift</div>
      <div class="key">q</div>
      <div class="keyText">显示所有四边形</div>
    </div>

    <div class="keyCombination">
      <div class="key">Tab</div>
      <div class="keyText">切换模式</div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const isShow = ref(false);
// eslint-disable-next-line no-unused-vars
watch(isShow, newIsShow => {
  if (newIsShow === false) {
    offsetX.value = -250;
    offsetY.value = -250;
  }
});

let isDragging = ref(false);
const offsetX = ref(-250);
const offsetY = ref(-250);
let oldMouseX = 0;
let oldMouseY = 0;
function dragStart(e) {
  isDragging.value = true;
  document.querySelector('.helpContainer').style.cursor = 'move';
  oldMouseX = e.clientX;
  oldMouseY = e.clientY;
}

function drag(e) {
  if (isDragging.value) {
    console.log('drag');
    offsetX.value += e.clientX - oldMouseX;
    offsetY.value += e.clientY - oldMouseY;
    oldMouseX = e.clientX;
    oldMouseY = e.clientY;
  }
}

function dragEnd() {
  isDragging.value = false;
  document.querySelector('.helpContainer').style.cursor = 'auto';
}
</script>

<style scoped>
.helpIcon {
  margin-bottom: 10px;

  width: 30px;

  height: 30px;

  cursor: pointer;
}

.helpContainer {
  position: fixed;

  background-color: #f0f0f0; /* 淡灰色 */

  border: 2px solid #333333; /* 深灰色 */

  top: 50%;

  left: 50%;

  transform: translate(-50%, -50%);

  width: 500px;

  height: 500px;

  border-radius: 8px;

  z-index: 9999;

  display: flex;

  flex-direction: column;

  padding: 20px;
}

.closeIcon {
  position: absolute;

  top: 10px;

  cursor: pointer;

  right: 10px;

  background-size: cover;

  pointer-events: all;
}

.keyCombination {
  position: relative;

  display: flex;

  column-gap: 4px;

  align-items: center;
}
.keyCombination > * {
  margin-bottom: 4px;
}
.keyText {
  position: absolute;

  margin-left: 30%;
}
.key {
  border-radius: 4px;

  padding: 4px;

  font-size: 14px;

  font-weight: 600;

  background-color: rgb(220, 220, 220);

  display: flex;

  color: rgb(0, 0, 0);

  border: 1px solid rgb(180, 180, 180);

  justify-content: center;

  align-items: center;
}
</style>

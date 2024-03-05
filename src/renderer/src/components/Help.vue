<template>
  <img class="helpIcon" src="../assets/help_outline_black_24dp.svg" @click="isShow = true" />

  <div v-if="isShow" class="helpContainer">
    <img class="closeIcon" src="../assets/close_black_24dp.svg" @click="isShow = false" />

    <div class="keyCombination">
      <div class="key">Ctrl</div>

      <div class="key">C</div>

      <div style="margin-left: 20px">复制</div>
    </div>

    <div class="keyCombination">
      <div class="key">Ctrl</div>

      <div class="key">V</div>

      <div style="margin-left: 20px">粘贴</div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const isShow = ref(false);
</script>

<style scoped>
.helpIcon {
  position: fixed;

  top: 10px;

  right: 10px;

  width: 30px;

  height: 30px;

  cursor: pointer;

  z-index: 999;
}

.helpContainer {
  position: fixed;

  background-color: white;

  top: 50%;

  left: 50%;

  transform: translate(-50%, -50%);

  width: 500px;

  height: 500px;

  border-radius: 8px;

  z-index: 999;

  display: flex;

  flex-direction: column;

  padding: 20px;
}

.closeIcon {
  position: absolute;

  top: 10px;

  cursor: pointer;

  right: 10px;
}

.keyCombination {
  display: flex;

  column-gap: 4px;

  align-items: center;
}

.key {
  border-radius: 4px;

  padding: 4px;

  font-size: 12px;

  font-weight: 500;

  background-color: rgb(241, 245, 249);

  display: flex;

  color: rgb(15, 23, 42);

  border: 1px solid rgb(226, 232, 240);
}
</style>


<script setup></script>

<template>
  <div style="width: 100%; height: 100%">
    <WindowProcess />
  </div>
</template>

<script>
import WindowProcess from './WindowProcess.vue';

export default {
  components: {
    WindowProcess,
  },
};
</script>

<style>
#app,
html,
body {
  margin: 0;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
}
</style>

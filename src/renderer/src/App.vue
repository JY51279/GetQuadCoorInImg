<script setup>
import WindowProcess from './components/WindowProcess.vue';
</script>

<template>
  <div class="app-root">
    <WindowProcess />
  </div>
</template>

<style>
:root {
  color-scheme: light;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* {
  box-sizing: border-box;
}

#app,
html,
body {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
}

button,
input {
  font: inherit;
}

.app-root {
  width: 100%;
  height: 100%;
}
</style>

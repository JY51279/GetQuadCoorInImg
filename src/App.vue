<script setup></script>

<template>
  <div style="width: 100%; height: 100%">
    <ImageUploader />
  </div>
</template>

<script>
import ImageUploader from './ImageUploader.vue';

export default {
  components: {
    ImageUploader,
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

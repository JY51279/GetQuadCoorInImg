<template>
  <section class="inspector-page image-annotation-page" aria-label="图片注解">
    <header class="note-header">
      <h2>图片注解</h2>
      <span class="note-status" :class="{ failed: Boolean(error), busy }" role="status">{{ status }}</span>
    </header>
    <p class="note-context">{{ imageNumber > 0 ? `第 ${imageNumber} 张图片` : '随当前图片切换' }}<span v-if="imageName"> · {{ imageName }}</span></p>
    <p class="note-hint">根据人工描述生成规范注解，仅发送文字。成功后自动保存到图集旁的 CSV。</p>
    <label class="note-label" for="image-annotation-input">人工描述</label>
    <textarea
      id="image-annotation-input"
      :value="modelValue"
      :disabled="!canInput"
      placeholder="例如：右侧码区有反光，左侧码区疑似存在拖影。"
      rows="7"
      spellcheck="false"
      @input="$emit('update:modelValue', $event.target.value)"
    ></textarea>
    <p class="note-hint draft-hint">未提交输入在切换图片时丢弃。</p>
    <div v-if="error" class="note-error" role="alert">
      <p>{{ error }}</p>
      <button v-if="loadError" type="button" class="action-button" :disabled="loading" @click="$emit('reload')">重试读取</button>
    </div>
    <button type="button" class="action-button primary submit-note" :disabled="!canSubmit" @click="$emit('submit')">
      {{ busy ? `${status}…` : '生成并保存' }}
    </button>
    <div class="saved-note">
      <h3>已保存的规范注解</h3>
      <p v-if="saved === null" class="note-hint">尚无已保存结果。</p>
      <p v-else-if="saved.annotation === ''" class="empty-note">已完成：无异常（注解正文为空）。</p>
      <p v-else class="note-result">{{ saved.annotation }}</p>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue';
const props = defineProps({
  modelValue: { type: String, default: '' },
  status: { type: String, required: true },
  error: { type: String, default: '' },
  loadError: { type: String, default: '' },
  loading: Boolean,
  canInput: Boolean,
  canSubmit: Boolean,
  imageNumber: { type: Number, default: 0 },
  imageName: { type: String, default: '' },
  saved: { type: Object, default: null },
});
defineEmits(['update:modelValue', 'submit', 'reload']);
const busy = computed(() => ['生成中', '保存中'].includes(props.status));
</script>

<style scoped src="../assets/workspace-controls.css"></style>
<style scoped>
.image-annotation-page { color: var(--text-primary); }
.note-header { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; min-height: 42px; }
.note-header h2 { margin: 0; font-size: 19px; }
.note-status { padding: 5px 8px; border-radius: 6px; background: var(--surface-muted); font-size: 12px; overflow-wrap: anywhere; }
.note-status.busy { color: var(--accent-strong); background: var(--accent-soft); }
.note-status.failed { color: var(--danger); background: var(--danger-soft); }
.note-context { color: var(--text-secondary); overflow-wrap: anywhere; line-height: 1.5; }
.note-hint { color: var(--text-secondary); font-size: 12px; line-height: 1.6; }
.note-label { display: block; margin: 20px 0 8px; font-weight: 600; }
textarea { box-sizing: border-box; width: 100%; min-height: 150px; padding: 10px 12px; border: 1px solid var(--border-strong); border-radius: 7px; resize: vertical; background: var(--surface-raised); color: var(--text-primary); font: 13px / 1.7 var(--font-ui); user-select: text; }
textarea:focus { outline: 2px solid var(--accent); outline-offset: 1px; }
textarea:disabled { background: var(--surface-muted); }
.draft-hint { margin: 6px 0 12px; }
.submit-note { width: 100%; min-height: 38px; }
.note-error { margin-bottom: 12px; padding: 10px 12px; border: 1px solid #edc5c7; border-radius: 7px; background: var(--danger-soft); color: var(--danger); overflow-wrap: anywhere; }
.note-error p { margin: 0 0 8px; line-height: 1.6; }
.saved-note { margin-top: 24px; padding-top: 16px; border-top: 1px solid var(--border-subtle); }
.saved-note h3 { margin: 0 0 12px; font-size: 13px; }
.note-result, .empty-note { margin: 0; padding: 12px; background: var(--surface-muted); border-radius: 7px; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 1.8; user-select: text; }
.empty-note { color: var(--text-secondary); }
</style>

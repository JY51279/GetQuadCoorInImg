<template>
  <section ref="pageRef" class="inspector-page image-annotation-page" aria-label="图片注解" tabindex="-1">
    <header class="note-header">
      <h2>图片注解</h2>
      <span class="note-status" :class="{ failed: Boolean(error), busy }" role="status">{{ status }}</span>
    </header>
    <p class="note-context">
      {{ imageNumber > 0 ? `第 ${imageNumber} 张图片` : '随当前图片切换'
      }}<span v-if="imageName"> · {{ imageName }}</span>
    </p>
    <p class="note-hint">根据人工描述生成规范注解，仅发送文字。完成规范化后自动保存到对应的 CSV。</p>
    <label class="note-label" for="image-annotation-input">人工描述</label>
    <textarea
      ref="inputRef"
      id="image-annotation-input"
      :value="modelValue"
      :disabled="!canInput"
      placeholder="例如：右侧码区有反光，左侧码区疑似存在拖影。"
      rows="7"
      spellcheck="false"
      @input="$emit('update:modelValue', $event.target.value)"
      @keydown="handleInputKeyDown"
      @compositionstart="composing = true"
      @compositionend="composing = false"
    ></textarea>
    <p v-if="feedback" class="note-hint draft-hint">反馈期间原始描述暂时锁定；F2 可聚焦待答问题。</p>
    <p v-else class="note-hint draft-hint">
      F2 聚焦输入；Enter 开始规范化，完成后保存；Shift+Enter 换行；Esc 退出输入。未提交输入在切换图片时丢弃。
    </p>
    <div v-if="feedback" class="feedback-panel" aria-label="待反馈问题">
      <h3>需要补充的信息</h3>
      <p class="note-hint">可只回答部分问题，也可直接补充、修正或结束细化；未选择的选项不会视为确认。</p>
      <fieldset
        v-for="question in feedback.questions"
        :key="question.id"
        class="feedback-question"
        :disabled="!canRespond"
      >
        <legend>{{ question.prompt }}</legend>
        <p class="note-hint">
          {{ question.selection === 'multiple' ? '可多选' : '单选' }} ·
          {{ question.purpose === 'clarify' ? '消除歧义' : '补充细节' }}
        </p>
        <label v-for="option in question.options" :key="option.id" class="feedback-option">
          <input
            :type="question.selection === 'multiple' ? 'checkbox' : 'radio'"
            :name="`annotation-feedback-${question.id}`"
            :checked="optionSelected(question.id, option.id)"
            @change="
              $emit('feedback-option', { questionId: question.id, optionId: option.id, checked: $event.target.checked })
            "
          />
          <span>{{ option.label }}</span>
        </label>
        <button
          v-if="hasSelectedOptions(question.id)"
          type="button"
          class="feedback-clear"
          @click="$emit('feedback-clear-options', question.id)"
        >
          清除本题选择
        </button>
        <label class="feedback-text-label" :for="`annotation-feedback-text-${question.id}`">对此问题补充文字</label>
        <textarea
          :id="`annotation-feedback-text-${question.id}`"
          class="feedback-text"
          :value="answerText(question.id)"
          rows="2"
          placeholder="可不选选项，直接说明"
          @input="$emit('feedback-text', { questionId: question.id, text: $event.target.value })"
          @keydown="handleFeedbackKeyDown"
          @compositionstart="composing = true"
          @compositionend="composing = false"
        ></textarea>
      </fieldset>
      <label class="feedback-text-label" for="annotation-feedback-message">其他补充或修正</label>
      <textarea
        id="annotation-feedback-message"
        class="feedback-text"
        :value="feedback.message"
        :disabled="!canRespond"
        rows="3"
        placeholder="可补充新情况、明确修正，或说明不再细化"
        @input="$emit('feedback-message', $event.target.value)"
        @keydown="handleFeedbackKeyDown"
        @compositionstart="composing = true"
        @compositionend="composing = false"
      ></textarea>
      <p class="note-hint">反馈输入中，Enter 继续规范化；Shift+Enter 换行；Esc 退出输入。</p>
      <div class="feedback-actions">
        <button
          type="button"
          class="action-button primary"
          :disabled="!canSubmitFeedback"
          @click="handleFeedbackSubmit()"
        >
          继续规范化
        </button>
        <button type="button" class="action-button" :disabled="!canRespond" @click="handleFeedbackSubmit(true)">
          按现有信息结束细化
        </button>
        <button type="button" class="action-button" :disabled="!canRespond" @click="handleRestartFeedback">
          重新编辑描述
        </button>
      </div>
    </div>
    <div v-if="error" class="note-error" role="alert">
      <p>{{ error }}</p>
      <button v-if="loadError" type="button" class="action-button" :disabled="loading" @click="$emit('reload')">
        重试读取
      </button>
    </div>
    <button
      v-if="!feedback"
      type="button"
      class="action-button primary submit-note"
      :disabled="!canSubmit"
      @click="handleSubmit"
    >
      {{ busy ? `${status}…` : '开始规范化并保存' }}
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
import { computed, nextTick, ref } from 'vue';
const props = defineProps({
  modelValue: { type: String, default: '' },
  status: { type: String, required: true },
  error: { type: String, default: '' },
  loadError: { type: String, default: '' },
  loading: Boolean,
  canInput: Boolean,
  canSubmit: Boolean,
  feedback: { type: Object, default: null },
  canRespond: Boolean,
  canSubmitFeedback: Boolean,
  imageNumber: { type: Number, default: 0 },
  imageName: { type: String, default: '' },
  saved: { type: Object, default: null },
});
const emit = defineEmits([
  'update:modelValue',
  'submit',
  'reload',
  'feedback-option',
  'feedback-text',
  'feedback-clear-options',
  'feedback-message',
  'submit-feedback',
  'restart-feedback',
]);
const busy = computed(() => ['生成中', '保存中'].includes(props.status));
const pageRef = ref(null);
const inputRef = ref(null);
let composing = false;

function focusInput() {
  if (props.feedback && props.canRespond) {
    const target = pageRef.value?.querySelector(
      '.feedback-panel input:not(:disabled), .feedback-panel textarea:not(:disabled)',
    );
    target?.focus();
    return document.activeElement === target;
  }
  if (!props.canInput) return false;
  inputRef.value?.focus();
  return document.activeElement === inputRef.value;
}

function answerText(questionId) {
  return props.feedback?.answers.find(answer => answer.questionId === questionId)?.text ?? '';
}

function optionSelected(questionId, optionId) {
  return Boolean(
    props.feedback?.answers.find(answer => answer.questionId === questionId)?.optionIds.includes(optionId),
  );
}

function hasSelectedOptions(questionId) {
  return Boolean(props.feedback?.answers.find(answer => answer.questionId === questionId)?.optionIds.length);
}

function leaveInput() {
  pageRef.value?.focus({ preventScroll: true });
}

function handleFeedbackSubmit(finish = false) {
  if (!props.canRespond || (!finish && !props.canSubmitFeedback)) return;
  emit('submit-feedback', finish);
  leaveInput();
}

function handleRestartFeedback() {
  if (!props.canRespond) return;
  emit('restart-feedback');
  void nextTick(() => focusInput());
}

function handleFeedbackKeyDown(event) {
  if (composing || event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    leaveInput();
    return;
  }
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat) handleFeedbackSubmit();
}

function handleSubmit() {
  if (!props.canSubmit) return;
  emit('submit');
  leaveInput();
}

function handleInputKeyDown(event) {
  if (composing || event.isComposing || event.keyCode === 229) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    leaveInput();
    return;
  }
  if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
  event.preventDefault();
  event.stopPropagation();
  if (!event.repeat) handleSubmit();
}

defineExpose({ focusInput });
</script>

<style scoped src="../assets/workspace-controls.css"></style>
<style scoped>
.image-annotation-page {
  color: var(--text-primary);
}
.note-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 42px;
}
.note-header h2 {
  margin: 0;
  font-size: 19px;
}
.note-status {
  padding: 5px 8px;
  border-radius: 6px;
  background: var(--surface-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.note-status.busy {
  color: var(--accent-strong);
  background: var(--accent-soft);
}
.note-status.failed {
  color: var(--danger);
  background: var(--danger-soft);
}
.note-context {
  color: var(--text-secondary);
  overflow-wrap: anywhere;
  line-height: 1.5;
}
.note-hint {
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.6;
}
.note-label {
  display: block;
  margin: 20px 0 8px;
  font-weight: 600;
}
textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 150px;
  padding: 10px 12px;
  border: 1px solid var(--border-strong);
  border-radius: 7px;
  resize: vertical;
  background: var(--surface-raised);
  color: var(--text-primary);
  font: 13px / 1.7 var(--font-ui);
  user-select: text;
}
textarea:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
textarea:disabled {
  background: var(--surface-muted);
}
.draft-hint {
  margin: 6px 0 12px;
}
.feedback-panel {
  margin: 16px 0;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 7px;
}
.feedback-panel h3 {
  margin: 0 0 8px;
  font-size: 14px;
}
.feedback-question {
  margin: 16px 0;
  padding: 8px 0 0;
  border: 0;
  border-top: 1px solid var(--border-subtle);
}
.feedback-question legend {
  padding: 0 4px 0 0;
  font-weight: 600;
  line-height: 1.6;
}
.feedback-question .note-hint {
  margin: 0 0 8px;
}
.feedback-option {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 8px 0;
  line-height: 1.5;
}
.feedback-option input {
  margin-top: 3px;
}
.feedback-clear {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--accent-strong);
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.feedback-text-label {
  display: block;
  margin: 12px 0 6px;
  font-weight: 600;
  font-size: 12px;
}
.feedback-text {
  min-height: 58px;
}
.feedback-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}
.submit-note {
  width: 100%;
  min-height: 38px;
}
.note-error {
  margin-bottom: 12px;
  padding: 10px 12px;
  border: 1px solid #edc5c7;
  border-radius: 7px;
  background: var(--danger-soft);
  color: var(--danger);
  overflow-wrap: anywhere;
}
.note-error p {
  margin: 0 0 8px;
  line-height: 1.6;
}
.saved-note {
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border-subtle);
}
.saved-note h3 {
  margin: 0 0 12px;
  font-size: 13px;
}
.note-result,
.empty-note {
  margin: 0;
  padding: 12px;
  background: var(--surface-muted);
  border-radius: 7px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  line-height: 1.8;
  user-select: text;
}
.empty-note {
  color: var(--text-secondary);
}
</style>

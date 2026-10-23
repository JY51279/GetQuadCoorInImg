import { computed, ref, watch } from 'vue';
import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';
import { toUserErrorMessage } from '../../../shared/UserMessages.js';

function pathKey(path) {
  const normalized = path.replace(/\\/g, '/');
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized;
}

function isSaved(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.rawDescription === 'string' &&
    typeof value.annotation === 'string'
  );
}

function createFeedback(text, turns, questions) {
  return {
    text,
    turns,
    questions,
    answers: questions.map(question => ({ questionId: question.id, optionIds: [], text: '' })),
    message: '',
  };
}

export function useImageAnnotations({ imageIndex, canEdit, invoke, notify, subscribeProgress }) {
  const dataset = ref(null);
  const records = ref([]);
  const inputText = ref('');
  const loading = ref(false);
  const loadError = ref('');
  let nextRequestId = 0;
  let disposed = false;

  const current = computed(() => records.value[imageIndex.value] ?? null);
  const input = computed({
    get: () => inputText.value,
    set: value => {
      if (canInput.value) {
        inputText.value = value;
        if (current.value) {
          current.value.error = '';
          current.value.incomplete = false;
        }
      }
    },
  });
  const status = computed(() => {
    if (!dataset.value) return '请先打开图集';
    if (loading.value) return '读取中';
    if (loadError.value) return '读取失败';
    if (!current.value) return '请选择图集中的图片';
    if (current.value.pending) return current.value.pending.stage === 'save' ? '保存中' : '生成中';
    if (current.value.error) return current.value.incomplete ? '未完成' : '失败';
    if (current.value.feedback) return '待反馈';
    if (inputText.value !== (current.value.saved?.rawDescription ?? '')) return '未提交修改';
    return current.value.saved ? '已保存' : '未注解';
  });
  const canInput = computed(() =>
    Boolean(
      current.value &&
        canEdit.value &&
        !loading.value &&
        !loadError.value &&
        !current.value.pending &&
        !current.value.feedback,
    ),
  );
  const canSubmit = computed(() => canInput.value && Boolean(inputText.value.trim()));
  const feedback = computed(() => current.value?.feedback ?? null);
  const canRespond = computed(() =>
    Boolean(feedback.value && canEdit.value && !loading.value && !loadError.value && !current.value.pending),
  );
  const canSubmitFeedback = computed(
    () =>
      canRespond.value &&
      (Boolean(feedback.value.message.trim()) ||
        feedback.value.answers.some(answer => answer.optionIds.length || answer.text.trim())),
  );
  const error = computed(() => loadError.value || current.value?.error || '');
  const hasPending = computed(() => records.value.some(record => Boolean(record.pending)));
  const busy = computed(() => loading.value || hasPending.value);

  watch(
    current,
    record => {
      inputText.value = record?.feedback?.text ?? record?.saved?.rawDescription ?? '';
    },
    { flush: 'sync' },
  );

  function clear() {
    dataset.value = null;
    records.value = [];
    inputText.value = '';
    loadError.value = '';
    loading.value = false;
  }

  async function reload() {
    const context = dataset.value;
    if (!context || loading.value) return;
    const requestId = ++nextRequestId;
    records.value = [];
    inputText.value = '';
    loadError.value = '';
    loading.value = true;
    try {
      const response = await invoke(IPC_CHANNELS.LOAD_ANNOTATIONS, {
        requestId,
        datasetPath: context.path,
      });
      if (disposed) return;
      if (response?.requestId !== requestId) throw new Error('注解读取响应与本次请求不匹配。');
      if (!response.success) throw new Error(response.error || '读取图集注解失败。');
      if (
        typeof response.datasetPath !== 'string' ||
        pathKey(response.datasetPath) !== pathKey(context.path) ||
        !Array.isArray(response.records) ||
        response.records.length !== context.imagePaths.length ||
        !response.records.every(
          (record, index) =>
            record?.imageIndex === index &&
            record.imagePath === context.imagePaths[index] &&
            (record.saved === null || isSaved(record.saved)),
        )
      )
        throw new Error('注解记录与当前已加载的图片列表不一致，请重新打开图集。');

      records.value = response.records.map(record => ({
        ...record,
        error: '',
        incomplete: false,
        pending: null,
        feedback: null,
      }));
    } catch (failure) {
      if (!disposed) loadError.value = toUserErrorMessage(failure, '读取图集注解失败。');
    } finally {
      if (!disposed) loading.value = false;
    }
  }

  function open(context) {
    clear();
    if (!context || typeof context.path !== 'string' || !context.path || !Array.isArray(context.imagePaths)) return;
    dataset.value = { path: context.path, imagePaths: [...context.imagePaths] };
    return reload();
  }

  async function run(entry, text, feedbackTurns = null) {
    const datasetPath = dataset.value.path;
    const imagePath = entry.imagePath;
    const requestId = ++nextRequestId;
    const label = `${datasetPath.split(/[\\/]/).at(-1)} · 第 ${entry.imageIndex + 1} 张图片`;
    entry.pending = { requestId, stage: 'generate' };
    entry.error = '';
    entry.incomplete = false;
    try {
      const response = await invoke(IPC_CHANNELS.GENERATE_AND_SAVE_ANNOTATION, {
        requestId,
        datasetPath,
        imagePath,
        text,
        ...(feedbackTurns === null ? {} : { feedbackTurns }),
      });
      if (disposed) return;
      if (response?.requestId !== requestId) throw new Error('注解保存响应与本次请求不匹配，请重新读取确认保存状态。');
      if (!response.success) throw new Error(response.error || '生成并保存注解失败。');
      if (
        response.imagePath !== imagePath ||
        typeof response.datasetPath !== 'string' ||
        pathKey(response.datasetPath) !== pathKey(datasetPath)
      )
        throw new Error('注解响应与提交的图片不匹配，请重新读取确认保存状态。');
      if (dataset.value?.path !== datasetPath || records.value[entry.imageIndex] !== entry) return;
      if (response.status === 'needs_feedback') {
        if (!Array.isArray(response.questions) || !response.questions.length)
          throw new Error('模型返回的反馈问题无效。');
        entry.feedback = createFeedback(text, feedbackTurns ?? [], response.questions);
        if (current.value === entry) inputText.value = text;
        return;
      }
      if (response.status !== 'final') throw new Error('模型返回的注解状态无效。');
      if (response.completed === false && response.annotation === '') {
        entry.feedback = null;
        entry.incomplete = true;
        entry.error = '当前描述无法形成有效注解，请修改后重试。';
        notify(`${label}：${entry.error}`);
        return;
      }
      if (
        response.completed !== true ||
        response.record?.imagePath !== imagePath ||
        response.record.imageIndex !== entry.imageIndex ||
        !isSaved(response.record.saved) ||
        response.record.saved.rawDescription !== text
      )
        throw new Error('注解保存结果与提交的图片或文本不匹配，请重新读取确认保存状态。');
      entry.saved = response.record.saved;
      entry.feedback = null;
      if (current.value === entry) inputText.value = text;
      notify(`${label}：注解已保存。`);
    } catch (failure) {
      if (!disposed) {
        entry.error = toUserErrorMessage(failure, '无法调用注解服务，请重试；若仍失败，请重启应用。');
        notify(`${label}：${entry.error}`);
      }
    } finally {
      entry.pending = null;
    }
  }

  function submit() {
    if (!canSubmit.value) return;
    return run(current.value, inputText.value);
  }

  function setFeedbackOption(questionId, optionId, checked) {
    if (!canRespond.value) return;
    const question = feedback.value.questions.find(item => item.id === questionId);
    const answer = feedback.value.answers.find(item => item.questionId === questionId);
    if (!question?.options.some(option => option.id === optionId) || !answer) return;
    answer.optionIds =
      question.selection === 'single'
        ? checked
          ? [optionId]
          : []
        : checked
          ? [...new Set([...answer.optionIds, optionId])]
          : answer.optionIds.filter(id => id !== optionId);
    current.value.error = '';
  }

  function setFeedbackText(questionId, text) {
    if (!canRespond.value || typeof text !== 'string') return;
    const answer = feedback.value.answers.find(item => item.questionId === questionId);
    if (!answer) return;
    answer.text = text;
    current.value.error = '';
  }

  function clearFeedbackOptions(questionId) {
    if (!canRespond.value) return;
    const answer = feedback.value.answers.find(item => item.questionId === questionId);
    if (!answer) return;
    answer.optionIds = [];
    current.value.error = '';
  }

  function setFeedbackMessage(message) {
    if (!canRespond.value || typeof message !== 'string') return;
    feedback.value.message = message;
    current.value.error = '';
  }

  function submitFeedback(finish = false) {
    if (!canRespond.value || (!finish && !canSubmitFeedback.value)) return;
    const entry = current.value;
    const session = entry.feedback;
    const answers = session.answers
      .filter(answer => answer.optionIds.length || answer.text.trim())
      .map(answer => ({ questionId: answer.questionId, optionIds: [...answer.optionIds], text: answer.text }));
    const message = finish
      ? [session.message.trim(), '结束细化，请根据已确认的信息生成最终注解。'].filter(Boolean).join('\n')
      : session.message;
    const turn = { questions: session.questions, answers, message };
    return run(entry, session.text, [...session.turns, turn]);
  }

  function restartFeedback() {
    if (!canRespond.value) return;
    current.value.feedback = null;
    current.value.error = '';
  }

  const unsubscribe = subscribeProgress?.(progress => {
    if (
      disposed ||
      typeof progress?.datasetPath !== 'string' ||
      !dataset.value ||
      pathKey(progress.datasetPath) !== pathKey(dataset.value.path) ||
      !['generate', 'save'].includes(progress.stage)
    )
      return;
    const entry = records.value.find(record => record.imagePath === progress.imagePath);
    if (entry?.pending?.requestId === progress.requestId) entry.pending.stage = progress.stage;
  });

  function dispose() {
    disposed = true;
    if (typeof unsubscribe === 'function') unsubscribe();
  }

  return {
    current,
    input,
    status,
    error,
    loading,
    loadError,
    canInput,
    canSubmit,
    feedback,
    canRespond,
    canSubmitFeedback,
    hasPending,
    busy,
    open,
    clear,
    reload,
    submit,
    setFeedbackOption,
    setFeedbackText,
    clearFeedbackOptions,
    setFeedbackMessage,
    submitFeedback,
    restartFeedback,
    dispose,
  };
}

import { computed, reactive, ref, watch } from 'vue';
import { IPC_CHANNELS } from '../../../shared/IpcChannels.js';
import { toUserErrorMessage } from '../../../shared/UserMessages.js';

function pathKey(path) {
  const normalized = path.replace(/\\/g, '/');
  return /^[a-z]:\//i.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized;
}
function entryKey(path, imagePath) {
  return `${pathKey(path)}\0${imagePath}`;
}
function isSaved(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.rawDescription === 'string' &&
    typeof value.annotation === 'string'
  );
}

export function useImageAnnotations({
  dataset,
  imageIndex,
  canEdit,
  invoke,
  confirmNavigation,
  notify,
  subscribeProgress,
}) {
  const entries = reactive(new Map());
  const records = ref([]);
  const loading = ref(false);
  const loadError = ref('');
  let nextRequestId = 0;
  let loadSequence = 0;
  let savedRevision = 0;
  let disposed = false;

  const current = computed(() => {
    const record = records.value[imageIndex.value];
    return dataset.value && record ? entries.get(entryKey(dataset.value.path, record.imagePath)) ?? null : null;
  });
  const isDirty = entry => Boolean(entry && entry.draft !== (entry.saved?.rawDescription ?? ''));
  const draft = computed({
    get: () => current.value?.draft ?? '',
    set: value => {
      if (current.value && canEdit.value && !loading.value && !loadError.value) {
        current.value.draft = value;
        current.value.error = '';
      }
    },
  });
  const status = computed(() => {
    if (!dataset.value) return '请先打开图集';
    if (loading.value) return '读取中';
    if (loadError.value) return '读取失败';
    if (!current.value) return '请选择图集中的图片';
    if (current.value.pending) return current.value.pending.stage === 'save' ? '保存中' : '生成中';
    if (current.value.error) return '失败';
    if (isDirty(current.value)) return '未提交修改';
    return current.value.saved ? '已保存' : '未注解';
  });
  const canInput = computed(() => Boolean(current.value && canEdit.value && !loading.value && !loadError.value));
  const canSubmit = computed(() => canInput.value && Boolean(draft.value.trim()) && !current.value.pending);
  const error = computed(() => loadError.value || current.value?.error || '');
  const hasUnsavedWork = computed(() => [...entries.values()].some(entry => isDirty(entry) || entry.pending));

  async function reload() {
    const sequence = ++loadSequence;
    const context = dataset.value;
    records.value = [];
    loadError.value = '';
    loading.value = Boolean(context);
    if (!context) return;
    const requestId = ++nextRequestId;
    const startedRevision = savedRevision;
    try {
      const response = await invoke(IPC_CHANNELS.LOAD_ANNOTATIONS, { requestId, datasetPath: context.path });
      if (disposed || sequence !== loadSequence) return;
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
        ) ||
        new Set(response.records.map(record => record.imagePath)).size !== response.records.length
      )
        throw new Error('注解记录与当前已加载的图片列表不一致，请重新打开图集。');

      for (const record of response.records) {
        const key = entryKey(context.path, record.imagePath);
        const existing = entries.get(key);
        if (!existing) {
          entries.set(key, {
            ...record,
            draft: record.saved?.rawDescription ?? '',
            error: '',
            pending: null,
            savedRevision: 0,
          });
        } else if (existing.savedRevision <= startedRevision) {
          const keepDraft = isDirty(existing) || existing.pending;
          existing.saved = record.saved;
          if (!keepDraft) existing.draft = record.saved?.rawDescription ?? '';
        }
      }
      records.value = response.records;
    } catch (failure) {
      if (!disposed && sequence === loadSequence) loadError.value = toUserErrorMessage(failure, '读取图集注解失败。');
    } finally {
      if (!disposed && sequence === loadSequence) loading.value = false;
    }
  }

  async function submit() {
    if (!canSubmit.value) return;
    const entry = current.value;
    const datasetPath = dataset.value.path;
    const imagePath = entry.imagePath;
    const text = entry.draft;
    const requestId = ++nextRequestId;
    const label = `${datasetPath.split(/[\\/]/).at(-1)} · 第 ${entry.imageIndex + 1} 张图片`;
    entry.pending = { requestId, text, stage: 'generate' };
    entry.error = '';
    try {
      const response = await invoke(IPC_CHANNELS.GENERATE_AND_SAVE_ANNOTATION, {
        requestId,
        datasetPath,
        imagePath,
        text,
      });
      if (disposed) return;
      if (response?.requestId !== requestId) throw new Error('注解保存响应与本次请求不匹配，请重新读取确认保存状态。');
      if (!response.success) throw new Error(response.error || '生成并保存注解失败。');
      if (
        response.completed !== true ||
        response.imagePath !== imagePath ||
        typeof response.datasetPath !== 'string' ||
        pathKey(response.datasetPath) !== pathKey(datasetPath) ||
        response.record?.imagePath !== imagePath ||
        response.record.imageIndex !== entry.imageIndex ||
        !isSaved(response.record.saved) ||
        response.record.saved.rawDescription !== text
      )
        throw new Error('注解保存结果与提交的图片或文本不匹配，请重新读取确认保存状态。');
      entry.saved = response.record.saved;
      entry.savedRevision = ++savedRevision;
      // Do not replace draft: the user may have typed a newer revision meanwhile.
      notify(`${label}：注解已保存。`);
    } catch (failure) {
      if (!disposed) {
        entry.error = toUserErrorMessage(failure, '生成并保存注解失败。');
        notify(`${label}：${entry.error}`);
      }
    } finally {
      entry.pending = null;
    }
  }

  function allowNavigation() {
    const entry = current.value;
    if (!isDirty(entry) || (entry.pending && entry.draft === entry.pending.text)) return true;
    return confirmNavigation(
      '当前图片有未提交的注解修改，是否继续切换？\n输入会保留在本次会话中，返回后可继续编辑；关闭应用后不会保留草稿。',
    );
  }

  const unsubscribe = subscribeProgress?.(progress => {
    if (disposed || typeof progress?.datasetPath !== 'string' || !['generate', 'save'].includes(progress.stage)) return;
    const entry = entries.get(entryKey(progress.datasetPath, progress.imagePath));
    if (entry?.pending?.requestId === progress.requestId) entry.pending.stage = progress.stage;
  });
  const stopWatching = watch(dataset, reload, { immediate: true });
  function dispose() {
    disposed = true;
    loadSequence++;
    stopWatching();
    if (typeof unsubscribe === 'function') unsubscribe();
  }
  return {
    current,
    draft,
    status,
    error,
    loading,
    loadError,
    canInput,
    canSubmit,
    hasUnsavedWork,
    reload,
    submit,
    allowNavigation,
    dispose,
  };
}

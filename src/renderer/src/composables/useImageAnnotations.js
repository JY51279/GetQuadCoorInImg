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
        if (current.value) current.value.error = '';
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
    if (inputText.value !== (current.value.saved?.rawDescription ?? '')) return '未提交修改';
    return current.value.saved ? '已保存' : '未注解';
  });
  const canInput = computed(() =>
    Boolean(current.value && canEdit.value && !loading.value && !loadError.value && !current.value.pending),
  );
  const canSubmit = computed(() => canInput.value && Boolean(inputText.value.trim()));
  const error = computed(() => loadError.value || current.value?.error || '');
  const hasPending = computed(() => records.value.some(record => Boolean(record.pending)));
  const busy = computed(() => loading.value || hasPending.value);

  watch(
    current,
    record => {
      inputText.value = record?.saved?.rawDescription ?? '';
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

      records.value = response.records.map(record => ({ ...record, error: '', pending: null }));
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

  async function submit() {
    if (!canSubmit.value) return;
    const entry = current.value;
    const datasetPath = dataset.value.path;
    const imagePath = entry.imagePath;
    const text = inputText.value;
    const requestId = ++nextRequestId;
    const label = `${datasetPath.split(/[\\/]/).at(-1)} · 第 ${entry.imageIndex + 1} 张图片`;
    entry.pending = { requestId, stage: 'generate' };
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
      if (current.value === entry) inputText.value = text;
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
    hasPending,
    busy,
    open,
    clear,
    reload,
    submit,
    dispose,
  };
}

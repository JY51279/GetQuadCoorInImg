import { computed, ref, watch } from 'vue';

const PREPARATION_FAILED_MESSAGE = '生成码区局部图失败。';
const QUADS_CHANGED_MESSAGE = '码区坐标已变化，请重新生成局部图。';

export function useAnnotationImagePreparation({
  canStart,
  getImagePath,
  getQuadSnapshot,
  getQuadSignature,
  prepareImages,
  submitVisual,
}) {
  const preparing = ref(false);
  const error = ref('');
  const preparedVisualInput = ref(null);
  const regions = computed(() => preparedVisualInput.value?.regions ?? []);
  let nextRequestId = 0;
  let disposed = false;

  const canPrepare = computed(() => !disposed && Boolean(canStart()) && !preparing.value);
  const canSubmit = computed(() => canPrepare.value && regions.value.length > 0);

  function clear(message = '') {
    nextRequestId++;
    preparing.value = false;
    preparedVisualInput.value = null;
    error.value = message;
  }

  function isSnapshotCurrent(snapshot) {
    if (!snapshot) return false;
    const imagePath = getImagePath();
    if (!imagePath || snapshot.imagePath !== imagePath) return false;
    const currentSnapshot = getQuadSnapshot();
    return currentSnapshot.success && snapshot.quadSignature === JSON.stringify(currentSnapshot.quads);
  }

  async function prepare() {
    if (!canPrepare.value) return;
    const snapshot = getQuadSnapshot();
    if (!snapshot.success) {
      error.value = snapshot.error;
      preparedVisualInput.value = null;
      return;
    }

    const requestId = ++nextRequestId;
    const imagePath = getImagePath();
    preparing.value = true;
    error.value = '';
    preparedVisualInput.value = null;
    try {
      const result = await prepareImages({ requestId, imagePath, quads: snapshot.quads });
      if (disposed || requestId !== nextRequestId) return;
      if (!result?.success || result.requestId !== requestId) {
        error.value = result?.error || PREPARATION_FAILED_MESSAGE;
        return;
      }
      preparedVisualInput.value = {
        regions: result.regions,
        snapshot: {
          imagePath,
          quadSignature: JSON.stringify(snapshot.quads),
          quads: snapshot.quads,
        },
      };
    } catch (failure) {
      if (!disposed && requestId === nextRequestId) {
        error.value = failure instanceof Error ? failure.message : PREPARATION_FAILED_MESSAGE;
      }
    } finally {
      if (!disposed && requestId === nextRequestId) preparing.value = false;
    }
  }

  function submit() {
    if (!canSubmit.value) return;
    return submitVisual(preparedVisualInput.value);
  }

  watch(getImagePath, () => {
    if (regions.value.length || preparing.value) clear();
  });
  watch(getQuadSignature, (nextSignature, previousSignature) => {
    if (nextSignature !== previousSignature && (regions.value.length || preparing.value)) {
      clear(QUADS_CHANGED_MESSAGE);
    }
  });

  function dispose() {
    if (disposed) return;
    disposed = true;
    clear();
  }

  return {
    preparing,
    regions,
    error,
    canPrepare,
    canSubmit,
    prepare,
    submit,
    clear,
    isSnapshotCurrent,
    dispose,
  };
}

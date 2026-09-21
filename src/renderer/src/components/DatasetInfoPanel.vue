<template>
  <section class="inspector-page">
    <header class="panel-header">
      <h2>图集与图片</h2>
    </header>
    <div v-if="datasetLoadError" class="dataset-load-error" role="alert">
      <strong>图集加载失败</strong>
      <p>{{ datasetLoadError.message }}</p>
      <dl>
        <div v-if="datasetLoadError.path">
          <dt>当前图集</dt>
          <dd :title="datasetLoadError.path">{{ datasetLoadError.path }}</dd>
        </div>
      </dl>
      <small>上一图集和下一图集将以该文件为切换基准。</small>
    </div>
    <dl class="metadata-list">
      <div>
        <dt>产品类型</dt>
        <dd>{{ loadedProductType || '未加载' }}</dd>
      </div>
      <div>
        <dt>图集 JSON</dt>
        <dd :title="jsonFileName">{{ jsonFileName || '未加载' }}</dd>
      </div>
      <div>
        <dt>图片</dt>
        <dd :title="imgFileName">{{ imgFileName || '未加载' }}</dd>
      </div>
    </dl>
  </section>
</template>
<script setup>
defineProps({
  datasetLoadError: { type: Object, default: null },
  loadedProductType: { type: String, default: '' },
  jsonFileName: { type: String, default: '' },
  imgFileName: { type: String, default: '' },
});
</script>
<style scoped>
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.panel-header {
  min-height: 42px;
}

.panel-header h2 {
  margin: 0;
  font-size: 19px;
  line-height: 1.2;
}

.metadata-list {
  display: grid;
  gap: 0;
  margin: 20px 0;
  border-top: 1px solid var(--border-subtle);
}

.dataset-load-error {
  display: grid;
  gap: 8px;
  margin: 16px 0 4px;
  padding: 12px;
  border: 1px solid #edc5c7;
  border-radius: 8px;
  background: var(--danger-soft);
  color: var(--text-primary);
}

.dataset-load-error > strong {
  color: var(--danger);
}

.dataset-load-error p,
.dataset-load-error dl {
  margin: 0;
}

.dataset-load-error p,
.dataset-load-error small {
  line-height: 1.45;
}

.dataset-load-error dl {
  display: grid;
  gap: 5px;
}

.dataset-load-error dl > div {
  display: grid;
  grid-template-columns: 64px minmax(0, 1fr);
  gap: 8px;
}

.dataset-load-error dt,
.dataset-load-error small {
  color: var(--text-secondary);
}

.dataset-load-error dd {
  min-width: 0;
  margin: 0;
  font: var(--font-size-code) / 1.4 var(--font-mono);
  overflow-wrap: anywhere;
}

.metadata-list > div {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 12px;
  padding: 12px 2px;
  border-bottom: 1px solid var(--border-subtle);
}

.metadata-list dt {
  color: var(--text-muted);
  font-size: var(--font-size-secondary);
}

.metadata-list dd {
  min-width: 0;
  margin: 0;
  color: var(--text-primary);
  font: var(--font-size-code) / 1.45 var(--font-mono);
  overflow-wrap: anywhere;
  white-space: normal;
}
</style>

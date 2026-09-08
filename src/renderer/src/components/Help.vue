<template>
  <section class="help-panel">
    <header class="help-header">
      <span class="eyebrow">键盘操作</span>
      <h2>快捷键帮助</h2>
      <p>标注快捷键在输入框聚焦时不会触发；长按只执行一次。</p>
    </header>

    <div class="shortcut-groups">
      <section v-for="group in groups" :key="group.title" class="shortcut-group">
        <h3>{{ group.title }}</h3>
        <dl>
          <div v-for="item in group.items" :key="`${group.title}-${item.label}`" class="shortcut-row">
            <dt>
              <template v-for="(key, index) in item.keys" :key="`${item.label}-${key}-${index}`">
                <span v-if="index > 0" class="key-separator">{{ item.separator || '+' }}</span>
                <kbd>{{ key }}</kbd>
              </template>
            </dt>
            <dd>{{ item.label }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <p class="help-footer"><kbd>F1</kbd> 或 <kbd>Esc</kbd> 返回上一页</p>
  </section>
</template>

<script setup>
defineProps({
  groups: {
    type: Array,
    default: () => [],
  },
});
</script>

<style scoped>
.help-panel {
  min-height: 0;
  overflow-y: auto;
}

.help-header {
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.help-header h2 {
  margin: 4px 0 8px;
  color: var(--text-primary);
  font-size: 20px;
}

.eyebrow {
  color: var(--accent);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.help-header p,
.help-footer {
  margin: 0;
  color: var(--text-secondary);
  font-size: 12px;
  line-height: 1.5;
}

.shortcut-groups {
  display: grid;
  gap: 22px;
  padding: 20px 0;
}

.shortcut-group h3 {
  margin: 0 0 10px;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.shortcut-group dl {
  display: grid;
  gap: 3px;
  margin: 0;
}

.shortcut-row {
  display: grid;
  grid-template-columns: minmax(104px, 0.9fr) minmax(130px, 1.1fr);
  gap: 14px;
  align-items: center;
  min-height: 32px;
  padding: 5px 8px;
  border-radius: 6px;
}

.shortcut-row:hover {
  background: var(--surface-hover);
}

.shortcut-row dt {
  display: flex;
  align-items: center;
  min-width: 0;
}

.shortcut-row dd {
  margin: 0;
  color: var(--text-primary);
  font-size: 12px;
}

.key-separator {
  margin: 0 4px;
  color: var(--text-muted);
  font-size: 10px;
}

.help-footer {
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 7px;
  background: var(--surface-muted);
  text-align: center;
}
</style>

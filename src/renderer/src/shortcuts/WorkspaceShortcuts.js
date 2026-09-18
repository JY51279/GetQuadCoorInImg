import { formatShortcutList } from '../utils/KeyboardShortcuts.js';

const SHORTCUT_GROUP = Object.freeze({
  NAVIGATION: 'navigation',
  ANNOTATION: 'annotation',
  DISPLAY: 'display',
});

export const WORKSPACE_SHORTCUT_HELP_GROUPS = Object.freeze([
  { id: SHORTCUT_GROUP.NAVIGATION, title: '导航与定位' },
  { id: SHORTCUT_GROUP.ANNOTATION, title: '标注编辑' },
  { id: SHORTCUT_GROUP.DISPLAY, title: '显示' },
]);

export const WORKSPACE_SHORTCUT_DEFINITIONS = Object.freeze([
  {
    id: 'inspector.dataset',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '打开图集与图片页',
    shortcuts: [{ key: '1', ctrl: true }],
  },
  {
    id: 'inspector.annotation',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '打开 Quad 标注页',
    shortcuts: [{ key: '2', ctrl: true }],
  },
  {
    id: 'inspector.display',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '打开视图与交互页',
    shortcuts: [{ key: '3', ctrl: true }],
  },
  {
    id: 'inspector.history',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '打开操作历史页',
    shortcuts: [{ key: '4', ctrl: true }],
  },
  {
    id: 'quad.previous',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '上一个 Quad',
    shortcuts: [{ key: 'w' }, { key: 'ArrowUp' }],
  },
  {
    id: 'quad.next',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '下一个 Quad',
    shortcuts: [{ key: 's' }, { key: 'ArrowDown' }],
  },
  {
    id: 'image.previous',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '上一张图片',
    shortcuts: [{ key: 'a' }, { key: 'ArrowLeft' }],
  },
  {
    id: 'image.next',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '下一张图片',
    shortcuts: [{ key: 'd' }, { key: 'ArrowRight' }],
  },
  {
    id: 'dataset.previous',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '上一图集',
    shortcuts: [
      { key: 'a', shift: true },
      { key: 'ArrowLeft', shift: true },
    ],
  },
  {
    id: 'dataset.next',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '下一图集',
    shortcuts: [
      { key: 'd', shift: true },
      { key: 'ArrowRight', shift: true },
    ],
  },
  {
    id: 'quad.focus.toggle',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '开关 Quad 聚焦模式',
    shortcuts: [{ key: 'f' }],
  },
  {
    id: 'pixel.focus',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '聚焦鼠标所在像素',
    shortcuts: [{ key: 'z' }],
  },
  {
    id: 'image.position.reset',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '重置图片位置',
    shortcuts: [{ key: 'r' }],
  },
  {
    id: 'dataset.open',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '打开或更换图集',
    shortcuts: [{ key: 'o', ctrl: true }],
  },
  {
    id: 'image.match',
    group: SHORTCUT_GROUP.NAVIGATION,
    label: '手动匹配图片',
    shortcuts: [{ key: 'i', ctrl: true }],
  },
  {
    id: 'point.remove',
    group: SHORTCUT_GROUP.ANNOTATION,
    label: '移除对应点位',
    shortcuts: [{ key: '1' }, { key: '2' }, { key: '3' }, { key: '4' }],
  },
  {
    id: 'quad.update',
    group: SHORTCUT_GROUP.ANNOTATION,
    label: '更新当前 Quad',
    shortcuts: [{ key: 's', ctrl: true }],
  },
  {
    id: 'quad.location.copy-previous',
    group: SHORTCUT_GROUP.ANNOTATION,
    label: '沿用上图同下标 Quad 坐标',
    shortcuts: [{ key: 'e', ctrl: true }],
  },
  {
    id: 'quad.location.apply-forward',
    group: SHORTCUT_GROUP.ANNOTATION,
    label: '将当前 Quad 坐标应用到后续图片',
    shortcuts: [{ key: 'e', ctrl: true, shift: true }],
  },
  {
    id: 'quad.add',
    group: SHORTCUT_GROUP.ANNOTATION,
    label: '新增 Quad',
    shortcuts: [{ key: 'a', ctrl: true }],
  },
  {
    id: 'quad.delete',
    group: SHORTCUT_GROUP.ANNOTATION,
    label: '删除当前 Quad',
    shortcuts: [{ key: 'd', ctrl: true }],
  },
  {
    id: 'point.clear',
    group: SHORTCUT_GROUP.ANNOTATION,
    label: '清空待提交的 P1–P4',
    shortcuts: [{ key: 'c' }],
  },
  {
    id: 'point.undo',
    group: SHORTCUT_GROUP.ANNOTATION,
    label: '撤回选点',
    shortcuts: [{ key: 'z', ctrl: true }],
  },
  {
    id: 'point.redo',
    group: SHORTCUT_GROUP.ANNOTATION,
    label: '重做选点',
    shortcuts: [{ key: 'y', ctrl: true }],
  },
  {
    id: 'json.undo',
    group: SHORTCUT_GROUP.ANNOTATION,
    label: '撤销 JSON 操作',
    shortcuts: [{ key: 'z', ctrl: true, shift: true }],
  },
  {
    id: 'json.redo',
    group: SHORTCUT_GROUP.ANNOTATION,
    label: '重做 JSON 操作',
    shortcuts: [{ key: 'y', ctrl: true, shift: true }],
  },
  {
    id: 'quad.visibility.toggle',
    group: SHORTCUT_GROUP.DISPLAY,
    label: '切换当前 Quad 显示',
    shortcuts: [{ key: 'q' }],
  },
  {
    id: 'quad.visibility.hide-all',
    group: SHORTCUT_GROUP.DISPLAY,
    label: '隐藏全部 Quad',
    shortcuts: [{ key: 'q', ctrl: true }],
  },
  {
    id: 'quad.visibility.show-all',
    group: SHORTCUT_GROUP.DISPLAY,
    label: '显示全部 Quad',
    shortcuts: [{ key: 'q', ctrl: true, shift: true }],
  },
  {
    id: 'quad.interaction.toggle',
    group: SHORTCUT_GROUP.DISPLAY,
    label: '切换默认 / 直接编辑模式',
    shortcuts: [{ key: 'Tab' }],
  },
  {
    id: 'help.toggle',
    group: SHORTCUT_GROUP.DISPLAY,
    label: '打开或关闭帮助',
    shortcuts: [{ key: 'F1' }],
    allowInEditable: true,
  },
  {
    id: 'help.close',
    shortcuts: [{ key: 'Escape' }],
    allowInEditable: true,
    showInHelp: false,
    when: ({ context }) => context?.isHelpOpen === true,
  },
]);

export function createWorkspaceShortcutCommands(actions) {
  const missingActionIds = WORKSPACE_SHORTCUT_DEFINITIONS.filter(
    command => typeof actions?.[command.id] !== 'function',
  ).map(command => command.id);
  if (missingActionIds.length > 0) {
    throw new TypeError(`Missing shortcut actions: ${missingActionIds.join(', ')}`);
  }

  return WORKSPACE_SHORTCUT_DEFINITIONS.map(command => ({
    ...command,
    run: actions[command.id],
  }));
}

export function getWorkspaceShortcutTitle(commandId) {
  const command = WORKSPACE_SHORTCUT_DEFINITIONS.find(candidate => candidate.id === commandId);
  if (!command?.label) return '';

  const shortcutText = formatShortcutList(command.shortcuts);
  return shortcutText ? `${command.label}（${shortcutText}）` : command.label;
}

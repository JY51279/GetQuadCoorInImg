export const USER_MESSAGES = Object.freeze({
  UNKNOWN_ERROR: '发生未知错误。',
  UNKNOWN_IMAGE_LOADING_ERROR: '图片加载失败，原因未知。',
  WAIT_FOR_CURRENT_OPERATION: '请等待当前操作完成。',
  NO_DATASET: '当前没有可用图集。',
  JSON_SAVE_FAILED: '保存 JSON 文件失败。',
  JSON_READ_FAILED: '读取 JSON 文件失败。',
  JSON_OPEN_FAILED: '打开 JSON 文件选择窗口失败。',
  DATASET_SWITCH_FAILED: '切换图集失败。',
  IMAGE_OPEN_FAILED: '打开图片失败。',
  IMAGE_READ_FAILED: '读取图片失败。',
  IMAGE_PATH_RESOLUTION_FAILED: '解析图片路径失败。',
});

const SYSTEM_ERROR_MESSAGES = Object.freeze({
  ENOENT: '文件不存在或已被移动。',
  EACCES: '没有访问该文件的权限。',
  EPERM: '文件可能被占用或设为只读，请关闭占用程序或检查文件属性后重试。',
  ENOSPC: '磁盘剩余空间不足。',
  EBUSY: '文件正被其他程序占用。',
  EISDIR: '所选路径指向文件夹而不是文件。',
  EROFS: '目标磁盘或目录为只读，无法写入。',
  EDQUOT: '当前用户或磁盘的存储配额已用尽。',
  EMFILE: '程序打开的文件过多，请关闭部分文件后重试。',
  ENFILE: '系统打开的文件过多，请关闭其他程序后重试。',
  ENAMETOOLONG: '文件路径过长，请缩短图集路径后重试。',
  ENOTDIR: '文件路径中的某一部分不是文件夹。',
  EEXIST: '目标文件已存在但无法替换，可能正被其他程序占用。',
});

function containsChineseText(value) {
  return /[\u3400-\u9fff]/u.test(value);
}

export function toUserErrorMessage(error, fallback = USER_MESSAGES.UNKNOWN_ERROR) {
  const rawMessage = typeof error === 'string' ? error : error?.message;
  if (typeof rawMessage === 'string' && containsChineseText(rawMessage)) return rawMessage;

  const errorCode = typeof error === 'object' && error !== null ? error.code : '';
  const systemMessage = SYSTEM_ERROR_MESSAGES[errorCode];
  if (systemMessage) return `${fallback} ${systemMessage}`;
  return typeof errorCode === 'string' && /^[A-Z][A-Z0-9_]+$/u.test(errorCode)
    ? `${fallback} 系统错误代码：${errorCode}。`
    : fallback;
}

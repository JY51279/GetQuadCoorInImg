export const USER_MESSAGES = Object.freeze({
  UNKNOWN_ERROR: '发生未知错误。',
  UNKNOWN_IMAGE_LOADING_ERROR: '图片加载失败，原因未知。',
  WAIT_FOR_CURRENT_OPERATION: '请等待当前操作完成。',
  NO_DATASET: '当前没有可用图集。',
  JSON_SAVE_FAILED: '保存 JSON 文件失败。',
  JSON_READ_FAILED: '读取 JSON 文件失败。',
  JSON_OPEN_FAILED: '打开 JSON 文件选择窗口失败。',
  IMAGE_OPEN_FAILED: '打开图片失败。',
  IMAGE_READ_FAILED: '读取图片失败。',
  IMAGE_PATH_RESOLUTION_FAILED: '解析图片路径失败。',
});

const SYSTEM_ERROR_MESSAGES = Object.freeze({
  ENOENT: '文件不存在或已被移动。',
  EACCES: '没有访问该文件的权限。',
  EPERM: '当前系统不允许执行此文件操作。',
  ENOSPC: '磁盘剩余空间不足。',
  EBUSY: '文件正被其他程序占用。',
  EISDIR: '所选路径指向文件夹而不是文件。',
});

function containsChineseText(value) {
  return /[\u3400-\u9fff]/u.test(value);
}

export function toUserErrorMessage(error, fallback = USER_MESSAGES.UNKNOWN_ERROR) {
  const rawMessage = typeof error === 'string' ? error : error?.message;
  if (typeof rawMessage === 'string' && containsChineseText(rawMessage)) return rawMessage;

  const errorCode = typeof error === 'object' && error !== null ? error.code : '';
  const systemMessage = SYSTEM_ERROR_MESSAGES[errorCode];
  return systemMessage ? `${fallback} ${systemMessage}` : fallback;
}

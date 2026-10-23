import { describe, expect, it } from 'vitest';

import { USER_MESSAGES, toUserErrorMessage } from '../src/shared/UserMessages.js';

describe('toUserErrorMessage', () => {
  it('preserves an existing Chinese application error', () => {
    expect(toUserErrorMessage(new Error('图片尺寸无效。'), USER_MESSAGES.IMAGE_READ_FAILED)).toBe('图片尺寸无效。');
  });

  it('maps a known system error code to a Chinese explanation', () => {
    const error = Object.assign(new Error('access denied'), { code: 'EACCES' });

    expect(toUserErrorMessage(error, USER_MESSAGES.IMAGE_READ_FAILED)).toBe('读取图片失败。 没有访问该文件的权限。');
  });

  it.each([
    ['EPERM', '文件可能被占用或设为只读，请关闭占用程序或检查文件属性后重试。'],
    ['EROFS', '目标磁盘或目录为只读，无法写入。'],
    ['EDQUOT', '当前用户或磁盘的存储配额已用尽。'],
    ['EMFILE', '程序打开的文件过多，请关闭部分文件后重试。'],
    ['ENFILE', '系统打开的文件过多，请关闭其他程序后重试。'],
    ['ENAMETOOLONG', '文件路径过长，请缩短图集路径后重试。'],
    ['ENOTDIR', '文件路径中的某一部分不是文件夹。'],
    ['EEXIST', '目标文件已存在但无法替换，可能正被其他程序占用。'],
  ])('maps filesystem error %s to an actionable explanation', (code, explanation) => {
    const error = Object.assign(new Error('filesystem failure'), { code });

    expect(toUserErrorMessage(error, '保存注解 CSV 失败。')).toBe(`保存注解 CSV 失败。 ${explanation}`);
  });

  it('includes an unknown system error code for diagnosis without exposing the raw exception', () => {
    const error = Object.assign(new Error('internal filesystem details'), { code: 'EUNKNOWN' });

    expect(toUserErrorMessage(error, '保存注解 CSV 失败。')).toBe('保存注解 CSV 失败。 系统错误代码：EUNKNOWN。');
  });

  it('does not expose an unknown English exception to the interface', () => {
    expect(toUserErrorMessage(new Error('disk unavailable'), USER_MESSAGES.JSON_SAVE_FAILED)).toBe(
      '保存 JSON 文件失败。',
    );
  });
});

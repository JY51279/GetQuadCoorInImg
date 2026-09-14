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

  it('does not expose an unknown English exception to the interface', () => {
    expect(toUserErrorMessage(new Error('disk unavailable'), USER_MESSAGES.JSON_SAVE_FAILED)).toBe(
      '保存 JSON 文件失败。',
    );
  });
});

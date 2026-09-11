import { afterEach, describe, expect, it, vi } from 'vitest';
import { useToastNotifications } from '../src/renderer/src/composables/useToastNotifications.js';

describe('Toast notifications', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps only the newest visible notifications', () => {
    vi.useFakeTimers();
    const toasts = useToastNotifications({ maximumVisible: 2 });

    toasts.notify('first');
    toasts.notify('second');
    toasts.notify('third');

    expect(toasts.notifications.value.map(notification => notification.message)).toEqual(['second', 'third']);
  });

  it('removes notifications after the configured duration', () => {
    vi.useFakeTimers();
    const toasts = useToastNotifications({ duration: 100 });
    toasts.notify(42);

    expect(toasts.notifications.value[0].message).toBe('42');
    vi.advanceTimersByTime(100);
    expect(toasts.notifications.value).toEqual([]);
  });

  it('clears notifications and cancels their timers', () => {
    vi.useFakeTimers();
    const toasts = useToastNotifications({ duration: 100 });
    toasts.notify('message');

    toasts.clear();
    vi.advanceTimersByTime(100);

    expect(toasts.notifications.value).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});

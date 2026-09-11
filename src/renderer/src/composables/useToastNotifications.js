import { ref } from 'vue';

export function useToastNotifications({ duration = 3000, maximumVisible = 4 } = {}) {
  const notifications = ref([]);
  const timers = new Map();
  let nextId = 0;

  function remove(id) {
    notifications.value = notifications.value.filter(notification => notification.id !== id);
    const timer = timers.get(id);
    if (timer) clearTimeout(timer);
    timers.delete(id);
  }

  function notify(message) {
    const notification = { id: ++nextId, message: String(message) };
    notifications.value.push(notification);

    if (notifications.value.length > maximumVisible) {
      remove(notifications.value[0].id);
    }

    const timer = setTimeout(() => remove(notification.id), duration);
    timers.set(notification.id, timer);
    return notification.id;
  }

  function clear() {
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    notifications.value = [];
  }

  return { notifications, notify, remove, clear };
}

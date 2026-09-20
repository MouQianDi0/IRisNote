const listeners = new Set<() => void>();
export function requestTodoSync() {
  listeners.forEach((listener) => listener());
}
export function onTodoSyncRetry(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

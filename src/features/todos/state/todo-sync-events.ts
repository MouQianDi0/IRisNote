const listeners = new Set<() => void>();
export function onTodoSyncChanged(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}
export function notifyTodoSyncChanged() {
    listeners.forEach((listener) => listener());
}

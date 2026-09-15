type Listener = () => void;

const listeners = new Set<Listener>();

export function notifyUploadQueueChanged() {
    for (const listener of listeners) {
        try {
            listener();
        } catch {
            console.warn("[Upload queue] 队列变更监听器执行失败");
        }
    }
}

export function onUploadQueueChanged(listener: Listener) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

import { useSyncExternalStore } from "react";

export type UploadQueueRuntimeSnapshot = {
    networkType: string;
    connected: boolean;
    server: "unknown" | "checking" | "available" | "unavailable";
    running: boolean;
};

let snapshot: UploadQueueRuntimeSnapshot = {
    networkType: "UNKNOWN",
    connected: false,
    server: "unknown",
    running: false,
};
const listeners = new Set<() => void>();

export function updateUploadQueueRuntime(
    changes: Partial<UploadQueueRuntimeSnapshot>,
) {
    snapshot = { ...snapshot, ...changes };
    listeners.forEach((listener) => listener());
}

export function getUploadQueueRuntimeSnapshot() {
    return snapshot;
}

export function useUploadQueueRuntime() {
    return useSyncExternalStore(
        (listener) => {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        getUploadQueueRuntimeSnapshot,
        getUploadQueueRuntimeSnapshot,
    );
}

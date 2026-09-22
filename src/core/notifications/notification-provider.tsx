import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import { useApplicationDatabase } from "@/core/database";
import {
    openDeviceNetworkSettings,
    readUploadQueueSummary,
    startUploadQueueCoordinator,
} from "@/core/sync";
import { useAuth } from "@/features/auth/hooks/useAuth";
import {
    setNoteSyncOwner,
    startNoteSyncCoordinator,
} from "@/features/notes/services/note-sync-coordinator";
import { executeUploadTask } from "@/features/sync";
import api from "@/shared/http/client";
import { resetConnectionSession } from "@/shared/http/connection-events";
import { OverlayProvider } from "@/shared/ui/Overlay/overlay-context";
import { router } from "expo-router";
import {
    useCallback,
    useEffect,
    useLayoutEffect,
    useRef,
    type PropsWithChildren,
} from "react";
import { AccessibilityInfo, AppState } from "react-native";
import { NotificationHost } from "./notification-host";
import { banner, notificationStore } from "./notification.service";
import { startConnectionCoordinator } from "./server-connection-coordinator";

export function NotificationProvider({ children }: PropsWithChildren) {
    const database = useApplicationDatabase();
    const { user, loading } = useAuth();
    const { enabled: cloudEnabled, generation: cloudGeneration } =
        useCloudStorage();
    const owner = useRef<number | null | undefined>(undefined);
    const announced = useRef(new Set<string>());
    const welcomed = useRef(new Set<number>());
    useLayoutEffect(() => {
        if (loading) return;
        const next = user?.id ?? null;
        if (owner.current === next) {
            // Fast Refresh can recreate the sync module while preserving this ref.
            // Rebind without resetting banners or cancelling same-account requests.
            setNoteSyncOwner(next);
            return;
        }
        banner.clearSession();
        resetConnectionSession();
        setNoteSyncOwner(next);
        announced.current.clear();
        owner.current = next;
        if (next === null) welcomed.current.clear();
        if (next !== null && !welcomed.current.has(next)) {
            welcomed.current.add(next);
            banner.show({
                id: "session-welcome",
                type: "special",
                priority: "low",
                title: "欢迎回来",
                lifetime: { mode: "timed", durationMs: 3000 },
                queueTtlMs: 3000,
            });
        }
    }, [user?.id, loading]);
    useEffect(() => {
        if (!user?.id || loading || cloudEnabled) return;
        // Local-only notes still expire while the app is active; this coordinator sends no cloud requests without consent.
        const notes = startNoteSyncCoordinator(database, user.id);
        notes.setActive(AppState.currentState === "active");
        const subscription = AppState.addEventListener("change", (state) =>
            notes.setActive(state === "active"),
        );
        return () => {
            notes.stop();
            subscription.remove();
        };
    }, [database, user?.id, loading, cloudEnabled, cloudGeneration]);
    useEffect(() => {
        if (!user?.id || loading || !cloudEnabled) {
            for (const id of [
                "upload-queue-sync",
                "upload-queue-paused",
                "upload-queue-blocked",
                "server-connection",
            ])
                notificationStore.withdraw(id);
            return;
        }
        const openQueue = () => router.push("/pages/user/sync-queue");
        const coordinator = startConnectionCoordinator(
            (signal) => api.get("/user/profile", { signal, timeout: 8000 }),
            {
                getPendingSummary: () =>
                    readUploadQueueSummary(database, user.id),
                openQueue,
            },
        );
        const uploadCoordinator = startUploadQueueCoordinator({
            database,
            ownerUserId: user.id,
            probe: (signal) =>
                api.get("/user/profile", { signal, timeout: 8000 }),
            execute: (task) => executeUploadTask(database, task),
            openQueue,
            openNetworkSettings: openDeviceNetworkSettings,
        });
        const noteCoordinator = startNoteSyncCoordinator(database, user.id);
        noteCoordinator.setActive(AppState.currentState === "active");
        coordinator.setActive(AppState.currentState === "active");
        uploadCoordinator.setActive(AppState.currentState === "active");
        const subscription = AppState.addEventListener("change", (state) => {
            const active = state === "active";
            coordinator.setActive(active);
            uploadCoordinator.setActive(active);
            noteCoordinator.setActive(active);
        });
        return () => {
            coordinator.stop();
            uploadCoordinator.stop();
            noteCoordinator.stop();
            subscription.remove();
        };
    }, [database, user?.id, loading, cloudEnabled, cloudGeneration]);
    useEffect(() => {
        notificationStore.setActive(AppState.currentState === "active");
        const appState = AppState.addEventListener("change", (state) =>
            notificationStore.setActive(state === "active"),
        );
        const timer = setInterval(() => notificationStore.tick(), 100);
        // Screen-reader mode keeps timed notices available until the user dismisses them.
        const setReader = (enabled: boolean) => {
            for (const item of notificationStore.getSnapshot())
                notificationStore.pause(item.id, "screen-reader", enabled);
        };
        let reader = false;
        let alive = true;
        void AccessibilityInfo.isScreenReaderEnabled().then((value) => {
            if (alive) {
                reader = value;
                setReader(value);
            }
        });
        const readerEvent = AccessibilityInfo.addEventListener(
            "screenReaderChanged",
            (value) => {
                reader = value;
                setReader(value);
            },
        );
        const unsubscribe = notificationStore.subscribe(() => {
            for (const item of notificationStore.getSnapshot()) {
                notificationStore.pause(item.id, "screen-reader", reader);
                const key = `${item.id}:${item.title}`;
                if (item.displayed && !announced.current.has(key)) {
                    announced.current.add(key);
                    if (announced.current.size > 200)
                        announced.current.delete(
                            announced.current.values().next().value!,
                        );
                    AccessibilityInfo.announceForAccessibility(
                        `${item.title}。${item.message ?? ""}`,
                    );
                }
            }
        });
        return () => {
            alive = false;
            clearInterval(timer);
            appState.remove();
            readerEvent.remove();
            unsubscribe();
            notificationStore.setActive(false);
        };
    }, []);
    const render = useCallback(() => <NotificationHost />, []);
    return <OverlayProvider render={render}>{children}</OverlayProvider>;
}

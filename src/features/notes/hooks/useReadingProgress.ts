import { useCallback, useEffect, useMemo } from "react";
import { AppState, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { banner, captureNotificationSession } from "@/core/notifications";
import { readingProgressStore } from "../data/note-reading-progress";
import { ReadingSession } from "../reading/reading-session";
import type { ReadingPosition } from "../reading/reading-position";

export function useReadingProgress({
    ownerId,
    noteId,
    serverId,
    content,
    restore,
    position,
    getOffset,
}: {
    ownerId: number;
    noteId: number;
    serverId: number | null;
    content: string | null;
    restore: (offset: number) => void;
    position: (position: ReadingPosition) => void;
    getOffset: () => number;
}) {
    const session = useMemo(() => {
        const notificationSession = captureNotificationSession();
        const id = `reading-save:${ownerId}:${noteId}`;
        const resolveFailure = () => {
            if (!notificationSession()) return;
            banner.resolve(id, {
                title: "阅读位置已恢复正常",
                type: "success",
            });
            banner.dismiss(id);
        };
        const showFailure = (operation: "read" | "save") => {
            if (!notificationSession()) return;
            banner.show({
                id,
                title:
                    operation === "read"
                        ? "阅读位置读取失败"
                        : "阅读位置保存失败",
                message:
                    operation === "read"
                        ? "原记录已保留，可重试读取。"
                        : "最新位置暂存内存，请重试保存。",
                type: "important",
                priority: "high",
                lifetime: { mode: "until-resolved" },
                action: {
                    label: "重试",
                    dismissOnSuccess: false,
                    onPress: async () => {
                        if (!notificationSession()) return;
                        if (instance.isActive()) return instance.retry();
                        // A failed leave-page write remains recoverable from the global banner.
                        await readingProgressStore.retry(ownerId, noteId);
                        await readingProgressStore.read(ownerId, noteId);
                        resolveFailure();
                    },
                },
            });
        };
        const instance = new ReadingSession(content, {
            read: async () => {
                await readingProgressStore.retry(ownerId, noteId);
                return readingProgressStore.read(ownerId, noteId);
            },
            save: async (value) => {
                try {
                    const result = await readingProgressStore.save(
                        ownerId,
                        noteId,
                        serverId,
                        value,
                    );
                    resolveFailure();
                    return result;
                } catch (error) {
                    showFailure("save");
                    throw error;
                }
            },
            restore,
            position,
            failed: (operation) => {
                if (operation === "read") showFailure(operation);
            },
            saved: resolveFailure,
        });
        return instance;
    }, [ownerId, noteId, serverId, content, restore, position]);

    useFocusEffect(
        useCallback(() => {
            void session.start();
            const flush = () => {
                session.sample(getOffset());
                void session.flush();
            };
            const interval = setInterval(flush, 1000);
            const subscription = AppState.addEventListener(
                "change",
                (state) => {
                    if (state !== "active") flush();
                    else void session.retry();
                },
            );
            const hide = () => {
                if (document.visibilityState === "hidden") flush();
            };
            if (Platform.OS === "web") {
                document.addEventListener("visibilitychange", hide);
                window.addEventListener("pagehide", flush);
            }
            return () => {
                flush();
                session.stop();
                clearInterval(interval);
                subscription.remove();
                if (Platform.OS === "web") {
                    document.removeEventListener("visibilitychange", hide);
                    window.removeEventListener("pagehide", flush);
                }
            };
        }, [session, getOffset]),
    );
    useEffect(() => () => session.stop(), [session]);
    return session;
}

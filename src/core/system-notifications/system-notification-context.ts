import { createContext, useContext } from "react";
import type { TodoEntity } from "@/features/todos/todos.types";
import type { SystemNotificationPermission } from "./system-notification.types";

export type SystemNotificationContextValue = {
    permission: SystemNotificationPermission | null;
    runtimeNotificationEnabled: boolean;
    runtimeNotificationPending: boolean;
    setRuntimeNotificationEnabled(enabled: boolean): Promise<boolean>;
    /** 动态通知卡片能力位（Android 8.0+ 且原生模块可用；Expo Go/web 为 false）。 */
    liveUpdateCapable: boolean;
    /** ProgressStyle/提升式与前台服务秒级刷新能力位（仅 Android 16+）。 */
    liveUpdateProgressCapable: boolean;
    /** 方案 B 开关：待办进行中卡片退后台由前台服务秒级刷新。 */
    liveTodoRealtimeEnabled: boolean;
    liveTodoRealtimePending: boolean;
    setLiveTodoRealtimeEnabled(enabled: boolean): Promise<boolean>;
    /** 运行 60 秒模拟待办，复用真实待办的动态通知与后台时间线。 */
    startTodoLiveDemo(onTick?: (remainingSeconds: number) => void): Promise<{
        cancel(): void;
        completion: Promise<"completed" | "cancelled" | "failed">;
    }>;
    afterSave(todo: TodoEntity, reason: "confirm" | "dismiss"): Promise<void>;
    openSettings(): void;
};

const fallback: SystemNotificationContextValue = {
    permission: null,
    runtimeNotificationEnabled: false,
    runtimeNotificationPending: false,
    setRuntimeNotificationEnabled: async () => false,
    liveUpdateCapable: false,
    liveUpdateProgressCapable: false,
    liveTodoRealtimeEnabled: false,
    liveTodoRealtimePending: false,
    setLiveTodoRealtimeEnabled: async () => false,
    startTodoLiveDemo: async () => ({
        cancel: () => {},
        completion: Promise.resolve("failed"),
    }),
    afterSave: async () => {},
    openSettings: () => {},
};

export const SystemNotificationContext = createContext(fallback);
export const useSystemNotifications = () =>
    useContext(SystemNotificationContext);

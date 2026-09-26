import { createContext, useContext } from "react";
import type { TodoEntity } from "@/features/todos/todos.types";
import type { SystemNotificationPermission } from "./system-notification.types";

export type SystemNotificationContextValue = {
    permission: SystemNotificationPermission | null;
    runtimeNotificationEnabled: boolean;
    runtimeNotificationPending: boolean;
    setRuntimeNotificationEnabled(enabled: boolean): Promise<boolean>;
    /** Android 16+ 动态通知能力位（Expo Go/web/低版本为 false），供设置页行禁用。 */
    liveUpdateCapable: boolean;
    /** 方案 B 开关：待办进行中卡片退后台由前台服务秒级刷新。 */
    liveTodoRealtimeEnabled: boolean;
    liveTodoRealtimePending: boolean;
    setLiveTodoRealtimeEnabled(enabled: boolean): Promise<boolean>;
    afterSave(todo: TodoEntity, reason: "confirm" | "dismiss"): Promise<void>;
    openSettings(): void;
};

const fallback: SystemNotificationContextValue = {
    permission: null,
    runtimeNotificationEnabled: false,
    runtimeNotificationPending: false,
    setRuntimeNotificationEnabled: async () => false,
    liveUpdateCapable: false,
    liveTodoRealtimeEnabled: false,
    liveTodoRealtimePending: false,
    setLiveTodoRealtimeEnabled: async () => false,
    afterSave: async () => {},
    openSettings: () => {},
};

export const SystemNotificationContext = createContext(fallback);
export const useSystemNotifications = () =>
    useContext(SystemNotificationContext);

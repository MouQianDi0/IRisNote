import { banner } from "@/core/notifications";
import type { TodoEntity } from "@/features/todos/todos.types";
import { isRunningInExpoGo } from "expo";
import { lazy, Suspense, type PropsWithChildren } from "react";
import {
    SystemNotificationContext,
    type SystemNotificationContextValue,
    useSystemNotifications,
} from "./system-notification-context";

const runningInExpoGo = isRunningInExpoGo();
const NativeSystemNotificationProvider = lazy(() =>
    import("./system-notification-native-provider").then((module) => ({
        default: module.SystemNotificationProvider,
    })),
);

const pendingNotificationState: SystemNotificationContextValue = {
    permission: null,
    runtimeNotificationEnabled: false,
    runtimeNotificationPending: true,
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

const expoGoNotificationState: SystemNotificationContextValue = {
    permission: {
        granted: false,
        canAskAgain: false,
    },
    runtimeNotificationEnabled: false,
    runtimeNotificationPending: false,
    setRuntimeNotificationEnabled: async () => {
        banner.show({
            title: "Expo Go 不支持常驻通知",
            message: "请使用开发构建或正式安装包",
            type: "neutral",
        });
        return false;
    },
    liveUpdateCapable: false,
    liveUpdateProgressCapable: false,
    liveTodoRealtimeEnabled: false,
    liveTodoRealtimePending: false,
    setLiveTodoRealtimeEnabled: async () => {
        banner.show({
            title: "Expo Go 不支持后台实时刷新",
            message: "请使用开发构建或正式安装包",
            type: "neutral",
        });
        return false;
    },
    startTodoLiveDemo: async () => ({
        cancel: () => {},
        completion: Promise.resolve("failed"),
    }),
    afterSave: async (todo: TodoEntity, _reason: "confirm" | "dismiss") => {
        if (!todo.reminderEnabled || todo.isCompleted || !todo.startTime)
            return;
        banner.show({
            id: "todo-reminder-expo-go",
            title: "待办已保存，Expo Go 不支持系统提醒",
            message: "请使用开发构建启用提醒",
            type: "neutral",
        });
    },
    openSettings: () => {},
};

/** Expo Go 不加载通知原生模块；开发构建和正式包沿用完整提醒能力。 */
export const systemNotificationsAvailable = !runningInExpoGo;
export { useSystemNotifications };

export function SystemNotificationProvider({ children }: PropsWithChildren) {
    if (runningInExpoGo)
        return (
            <SystemNotificationContext.Provider value={expoGoNotificationState}>
                {children}
            </SystemNotificationContext.Provider>
        );
    return (
        <SystemNotificationContext.Provider value={pendingNotificationState}>
            <Suspense fallback={null}>
                <NativeSystemNotificationProvider>
                    {children}
                </NativeSystemNotificationProvider>
            </Suspense>
        </SystemNotificationContext.Provider>
    );
}

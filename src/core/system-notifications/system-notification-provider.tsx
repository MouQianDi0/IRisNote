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
  afterSave: async () => {},
  openSettings: () => {},
};

const expoGoNotificationState: SystemNotificationContextValue = {
  permission: {
    granted: false,
    canAskAgain: false,
  },
  afterSave: async (todo: TodoEntity, _reason: "confirm" | "dismiss") => {
    if (!todo.reminderEnabled || todo.isCompleted || !todo.startTime) return;
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
      <Suspense fallback={children}>
        <NativeSystemNotificationProvider>
          {children}
        </NativeSystemNotificationProvider>
      </Suspense>
    </SystemNotificationContext.Provider>
  );
}

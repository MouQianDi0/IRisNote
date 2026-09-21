import { createContext, useContext } from "react";
import type { TodoEntity } from "@/features/todos/todos.types";
import type { SystemNotificationPermission } from "./system-notification.types";

export type SystemNotificationContextValue = {
  permission: SystemNotificationPermission | null;
  runtimeNotificationEnabled: boolean;
  runtimeNotificationPending: boolean;
  setRuntimeNotificationEnabled(enabled: boolean): Promise<boolean>;
  afterSave(todo: TodoEntity, reason: "confirm" | "dismiss"): Promise<void>;
  openSettings(): void;
};

const fallback: SystemNotificationContextValue = {
  permission: null,
  runtimeNotificationEnabled: false,
  runtimeNotificationPending: false,
  setRuntimeNotificationEnabled: async () => false,
  afterSave: async () => {},
  openSettings: () => {},
};

export const SystemNotificationContext = createContext(fallback);
export const useSystemNotifications = () =>
  useContext(SystemNotificationContext);

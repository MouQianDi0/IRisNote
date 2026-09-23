import type { NativeExactAlarmAccess } from "@modules/irisnote-system";

export type SystemNotificationPermission = {
    granted: boolean;
    canAskAgain: boolean;
};
export type ExactAlarmAccess = NativeExactAlarmAccess | "unavailable";
export type TodoNotificationData = {
    kind: "todo-start";
    ownerKey: string;
    todoId: string;
};
export type ScheduledSystemNotification = {
    identifier: string;
};
export interface SystemNotificationPort {
    permission(): Promise<SystemNotificationPermission>;
    scheduled(): Promise<readonly ScheduledSystemNotification[]>;
    schedule(
        identifier: string,
        at: number,
        body: string,
        data: TodoNotificationData,
    ): Promise<string>;
    cancel(identifier: string): Promise<void>;
}

export const TODO_NOTIFICATION_PREFIX = "irisnote.todo.";
export const REMINDER_CHANNEL = "irisnote.reminders.v1";
export const RUNTIME_CHANNEL = "irisnote.runtime.v1";
export const DIAGNOSTIC_CHANNEL = "irisnote.diagnostics.v1";
export const LIVE_TEST_CHANNEL = "irisnote.live-test.v1";
export const LIVE_TODO_CHANNEL = "irisnote.live-todo.v1";
export const RUNTIME_NOTIFICATION_ID = "irisnote.runtime.status";
/** Android 原生 NotificationManager 的整型通知 ID：设置页动态通知演示专用。 */
export const LIVE_TEST_NOTIFICATION_ID = 7001;
// Reserved semantic only; no unused Android channel is created.
export type SystemNotificationPurpose =
    | "reminder"
    | "runtime-status"
    | "diagnostic-test"
    | "live-update-test"
    | "live-update-todo"
    | "sync";

export function parseTodoNotificationData(
    data: Record<string, unknown> | undefined,
): TodoNotificationData | null {
    return data?.kind === "todo-start" &&
        typeof data.ownerKey === "string" &&
        typeof data.todoId === "string" &&
        data.ownerKey.length > 0 &&
        data.todoId.length > 0
        ? { kind: "todo-start", ownerKey: data.ownerKey, todoId: data.todoId }
        : null;
}

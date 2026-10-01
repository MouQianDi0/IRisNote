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
export const LIVE_TODO_CHANNEL = "irisnote.live-todo.v1";
export const LIVE_TODO_SUMMARY_CHANNEL = "irisnote.live-todo-summary.v1";
export const RUNTIME_NOTIFICATION_ID = "irisnote.runtime.status";
/** Android 原生 NotificationManager 的整型通知 ID：设置页动态通知演示专用。 */
export const LIVE_TEST_NOTIFICATION_ID = 7001;
export const LIVE_TODO_SUMMARY_NOTIFICATION_ID = 7002;
export const EXCERPT_SESSION_CHANNEL = "irisnote.excerpt-session.v1";
// 7004：保留段 7001 演示 / 7002 聚合卡 / 7003 前台服务停机占位（LiveTodoForegroundService）。
// 摘录会话卡曾用 7003 与停机占位冲突（占位会顶掉本卡），迁移到 7004；
// 原生侧 ExcerptSessionNotifications.ID 同步为 7004，并在发卡时清理旧 7003 残留。
export const EXCERPT_SESSION_NOTIFICATION_ID = 7004;
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

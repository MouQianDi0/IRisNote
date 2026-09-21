import {
  TODO_NOTIFICATION_PREFIX,
  type TodoNotificationData,
  type SystemNotificationPermission,
} from "@/core/system-notifications/system-notification.types";
import type { TodoEntity, TodoFields } from "../todos.types";

/** Local civil time, deliberately independent of the historical timeZone field. */
export function todoStartInstant(
  fields: Pick<TodoFields, "dateId" | "startTime">,
): number | null {
  if (fields.startTime === null) return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(fields.dateId) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(fields.startTime)
  )
    throw new Error("待办开始时间无效");
  const [year, month, day] = fields.dateId.split("-").map(Number);
  const [hour, minute] = fields.startTime.split(":").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  )
    throw new Error("该开始时间在设备当前时区不存在，请调整时间");
  return date.getTime();
}

export function desiredTodoReminder(
  todo: TodoEntity,
  now: number,
): number | null {
  if (!todo.reminderEnabled || todo.isCompleted || !todo.startTime) return null;
  const at = todoStartInstant(todo);
  return at !== null && at > now ? at : null;
}

export function todoNotificationIdentifier(ownerKey: string, todoId: string) {
  return `${TODO_NOTIFICATION_PREFIX}${encodeURIComponent(ownerKey)}.${encodeURIComponent(todoId)}`;
}

export function reminderSummary(body: string) {
  return Array.from(
    body
      .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  )
    .slice(0, 100)
    .join("");
}

export function resolveReminderTarget(
  data: TodoNotificationData,
  ownerKey: string | null,
  entities: readonly TodoEntity[],
) {
  if (data.ownerKey !== ownerKey) return null;
  return (
    entities.find(
      (todo) => todo.ownerKey === ownerKey && todo.clientId === data.todoId,
    ) ?? null
  );
}

export type SavedReminderPermissionPort = {
  isCurrent: () => boolean;
  permission: () => Promise<SystemNotificationPermission>;
  request: () => Promise<SystemNotificationPermission>;
  publish: (permission: SystemNotificationPermission) => void;
  showDisabled: () => void;
  showError: () => void;
  reconcile: () => Promise<void>;
};

/** Called only after the todo commit. Permission/OS failures never reject the save. */
export async function afterSavedTodoReminder(
  todo: TodoEntity,
  reason: "confirm" | "dismiss",
  port: SavedReminderPermissionPort,
  now = Date.now(),
) {
  try {
    if (!port.isCurrent() || desiredTodoReminder(todo, now) === null) return;
    let permission = await port.permission();
    if (!port.isCurrent()) return;
    if (reason === "confirm" && !permission.granted && permission.canAskAgain)
      permission = await port.request();
    if (!port.isCurrent()) return;
    port.publish(permission);
    if (!permission.granted) port.showDisabled();
    await port.reconcile();
  } catch {
    if (port.isCurrent()) port.showError();
  }
}

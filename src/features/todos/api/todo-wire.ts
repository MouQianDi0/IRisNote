import { assertValidTodo } from "../domain/todo-validation";
import type { TodoEntity } from "../todos.types";
import {
  TodoApiError,
  type TodoDTO,
  type TodoRemote,
  type TodoBusiness,
  isDeleted,
} from "../sync.types";

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw invalid();
  return value as Record<string, unknown>;
}
export function invalid() {
  return new TodoApiError(
    0,
    "INVALID_RESPONSE",
    "待办服务器响应无效，已保留本地内容",
  );
}
export function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw invalid();
  return value;
}
export function positive(value: unknown): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1)
    throw invalid();
  return value;
}
export function boolean(value: unknown): boolean {
  if (typeof value !== "boolean") throw invalid();
  return value;
}
function timestamp(value: unknown): string {
  const result = text(value);
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(result) ||
    !Number.isFinite(Date.parse(result)) ||
    new Date(result).toISOString() !== result
  )
    throw invalid();
  return result;
}
export function validateRemote(
  value: unknown,
  userId: number,
  clientId?: string,
  id?: number,
): TodoRemote {
  const r = object(value);
  const identity = {
    id: positive(r.id),
    client_id: text(r.client_id).toLowerCase(),
    version: positive(r.version),
  };
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      identity.client_id,
    ) ||
    (clientId !== undefined && identity.client_id !== clientId) ||
    (id !== undefined && identity.id !== id)
  )
    throw invalid();
  if (r.deleted_at !== null)
    return { ...identity, deleted_at: timestamp(r.deleted_at) };
  if (r.user_id !== userId) throw invalid();
  const dto = { ...r, ...identity } as TodoDTO;
  for (const key of [
    "is_starred",
    "is_pinned",
    "reminder_enabled",
    "is_completed",
  ] as const)
    boolean(dto[key]);
  timestamp(dto.created_at);
  timestamp(dto.updated_at);
  if (dto.is_completed) timestamp(dto.completed_at);
  else if (dto.completed_at !== null) throw invalid();
  try {
    assertValidTodo(fromRemote(dto, `user:${userId}`, 1));
  } catch {
    throw invalid();
  }
  return dto;
}
export function activeRemote(value: unknown, userId: number): TodoDTO {
  const dto = validateRemote(value, userId);
  if (isDeleted(dto)) throw invalid();
  return dto;
}
export function business(todo: TodoEntity): TodoBusiness {
  return {
    body: todo.body,
    priority: todo.priority,
    date_id: todo.dateId,
    start_time: todo.startTime,
    end_time: todo.endTime,
    is_starred: todo.isStarred,
    is_pinned: todo.isPinned,
    reminder_enabled: todo.reminderEnabled,
    time_zone: todo.timeZone,
    is_completed: todo.isCompleted,
    completed_at: todo.completedAt,
  };
}
export function fromRemote(
  dto: TodoDTO,
  ownerKey: string,
  localVersion: number,
): TodoEntity {
  return {
    ownerKey,
    clientId: dto.client_id,
    localVersion,
    body: dto.body,
    priority: dto.priority,
    dateId: dto.date_id,
    startTime: dto.start_time,
    endTime: dto.end_time,
    isStarred: dto.is_starred,
    isPinned: dto.is_pinned,
    reminderEnabled: dto.reminder_enabled,
    timeZone: dto.time_zone,
    isCompleted: dto.is_completed,
    completedAt: dto.completed_at,
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

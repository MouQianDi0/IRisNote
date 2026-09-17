import { toDateId } from "@/shared/utils/date-id";
import type { TodoEntity, TodoDisplayState, TodoStatus } from "../todos.types";

export function timeOnDate(dateId: string, time: string): number {
  const [year, month, day] = dateId.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(hour, minute, 0, 0);
  return date.getTime();
}

export function todoStatus(todo: TodoEntity, now: Date): TodoStatus {
  if (todo.isCompleted) return "completed";
  const today = toDateId(now);
  if (
    todo.dateId < today ||
    (todo.dateId === today &&
      todo.endTime !== null &&
      timeOnDate(today, todo.endTime) < now.getTime())
  )
    return "expired";
  if (
    todo.dateId > today ||
    (todo.dateId === today &&
      todo.startTime !== null &&
      timeOnDate(today, todo.startTime) > now.getTime())
  )
    return "pending";
  return "inProgress";
}

export function todoDisplayState(
  todo: TodoEntity,
  now: Date,
): TodoDisplayState {
  return todo.isCompleted
    ? todo.dateId < toDateId(now)
      ? "ended"
      : "done"
    : todo.priority;
}

export function todoTitle(todo: Pick<TodoEntity, "body">): string {
  return todo.body.trim().split(/\r?\n/)[0];
}

export function todoTimeLabel(
  todo: Pick<TodoEntity, "startTime" | "endTime">,
): string {
  if (todo.startTime === null) return "全天";
  return todo.endTime === null
    ? todo.startTime
    : `${todo.startTime}–${todo.endTime}`;
}

/** One page timer handles boundaries; a minute is the clock-change fallback. */
export function nextTodoRefresh(
  todos: readonly TodoEntity[],
  now: Date,
): number {
  const instant = now.getTime();
  const midnight = new Date(instant);
  midnight.setHours(24, 0, 0, 0);
  let next = Math.min(instant + 60_000, midnight.getTime());
  const today = toDateId(now);
  for (const todo of todos) {
    if (todo.isCompleted || todo.dateId !== today) continue;
    for (const boundary of [
      todo.startTime === null ? null : timeOnDate(today, todo.startTime),
      todo.endTime === null ? null : timeOnDate(today, todo.endTime) + 1,
    ]) {
      if (boundary !== null && boundary > instant)
        next = Math.min(next, boundary);
    }
  }
  return Math.max(1, next - instant);
}

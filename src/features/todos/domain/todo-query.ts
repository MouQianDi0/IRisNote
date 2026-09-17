import type { TodoEntity, TodoQuery } from "../todos.types";
import { todoStatus } from "./todo-state";

const priorityRank = { high: 0, normal: 1, low: 2 };
export function queryTodos(
  todos: readonly TodoEntity[],
  query: TodoQuery,
  now: Date,
): TodoEntity[] {
  const keyword = query.keyword.trim().toLocaleLowerCase();
  return todos
    .filter(
      (todo) =>
        todo.dateId === query.dateId &&
        (query.filter === "all" || todoStatus(todo, now) === query.filter) &&
        (!keyword || todo.body.toLocaleLowerCase().includes(keyword)),
    )
    .sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      if ((a.startTime === null) !== (b.startTime === null))
        return a.startTime === null ? 1 : -1;
      if (query.sort === "priority") {
        const priority = priorityRank[a.priority] - priorityRank[b.priority];
        if (priority) return priority;
      }
      if (
        a.startTime !== null &&
        b.startTime !== null &&
        a.startTime !== b.startTime
      ) {
        const order = a.startTime < b.startTime ? -1 : 1;
        return query.sort === "timeDesc" ? -order : order;
      }
      const created = Date.parse(a.createdAt) - Date.parse(b.createdAt);
      return (
        created ||
        (a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0)
      );
    });
}

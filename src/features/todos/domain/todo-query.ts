import { addDays, compareDateId } from "@/shared/utils/date-id";
import type {
    TodoEntity,
    TodoFilter,
    TodoQuery,
    TodoSort,
    TodoWeekQuery,
} from "../todos.types";
import { todoStatus } from "./todo-state";

const priorityRank = { high: 0, normal: 1, low: 2 };

const matchesVisible = (
    todo: TodoEntity,
    filter: TodoFilter,
    keyword: string,
    now: Date,
): boolean =>
    (filter === "all" || todoStatus(todo, now) === filter) &&
    (!keyword || todo.body.toLocaleLowerCase().includes(keyword));

const compareTodos = (a: TodoEntity, b: TodoEntity, sort: TodoSort): number => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    if ((a.startTime === null) !== (b.startTime === null))
        return a.startTime === null ? 1 : -1;
    if (sort === "priority") {
        const priority = priorityRank[a.priority] - priorityRank[b.priority];
        if (priority) return priority;
    }
    if (
        a.startTime !== null &&
        b.startTime !== null &&
        a.startTime !== b.startTime
    ) {
        const order = a.startTime < b.startTime ? -1 : 1;
        return sort === "timeDesc" ? -order : order;
    }
    const created = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return (
        created ||
        (a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0)
    );
};

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
                matchesVisible(todo, query.filter, keyword, now),
        )
        .sort((a, b) => compareTodos(a, b, query.sort));
}

/** 整周查询：按周一至周日区间过滤，日期升序在前，组内沿用统一排序规则。 */
export function queryTodosByWeek(
    todos: readonly TodoEntity[],
    query: TodoWeekQuery,
    now: Date,
): TodoEntity[] {
    const keyword = query.keyword.trim().toLocaleLowerCase();
    const endDateId = addDays(query.weekId, 6);
    return todos
        .filter(
            (todo) =>
                todo.dateId >= query.weekId &&
                todo.dateId <= endDateId &&
                matchesVisible(todo, query.filter, keyword, now),
        )
        .sort(
            (a, b) =>
                compareDateId(a.dateId, b.dateId) ||
                compareTodos(a, b, query.sort),
        );
}

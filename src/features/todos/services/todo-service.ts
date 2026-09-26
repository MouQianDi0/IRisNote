import type { TodoRepository } from "../data/todo-repository.port";
import {
    TodoError,
    todoFormKeys,
    type TodoFields,
    type TodoEntity,
} from "../todos.types";
import {
    normalizeTodoFields,
    assertValidTodo,
} from "../domain/todo-validation";

/** Stable per-form UUID; this identifier is not used for authorization. */
export function newTodoId(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
        const value = Math.floor(Math.random() * 16);
        return (char === "x" ? value : (value & 3) | 8).toString(16);
    });
}

export function deviceTimeZone(): string | null {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
        return null;
    }
}

export function emptyTodoFields(dateId: string): TodoFields {
    return {
        body: "",
        dateId,
        startTime: null,
        endTime: null,
        priority: "normal",
        isStarred: false,
        isPinned: false,
        reminderEnabled: true,
        timeZone: deviceTimeZone(),
    };
}

export function todoFields(todo: TodoEntity): TodoFields {
    return Object.fromEntries(
        todoFormKeys.map((key) => [key, todo[key]]),
    ) as TodoFields;
}

export function formPatch(
    base: TodoEntity,
    fields: TodoFields,
): Partial<TodoFields> {
    return Object.fromEntries(
        todoFormKeys
            .filter((key) => base[key] !== fields[key])
            .map((key) => [key, fields[key]]),
    );
}

/** Empty dismissals are discarded only for new forms; editing never deletes on empty text. */
export function prepareTodoExit(
    base: TodoEntity | null,
    fields: TodoFields,
    reason: "confirm" | "dismiss" | "cancel",
): TodoFields | null {
    if (
        reason === "cancel" ||
        (!base && reason === "dismiss" && !fields.body.trim())
    )
        return null;
    const normalized = normalizeTodoFields(fields);
    assertValidTodo(normalized);
    return normalized;
}

export function assertTodoSession(
    repository: TodoRepository,
    ownerKey: string,
    generation: number,
) {
    if (
        repository.ownerKey !== ownerKey ||
        repository.generation !== generation
    )
        throw new TodoError("owner", "账号会话已失效，请重新打开待办");
}

/** Callers must await the receipt before closing; the memory test adapter may return immediately. */
export function saveTodoForm(
    repository: TodoRepository,
    ownerKey: string,
    generation: number,
    clientId: string,
    base: TodoEntity | null,
    fields: TodoFields,
    now: Date,
) {
    assertTodoSession(repository, ownerKey, generation);
    const normalized = normalizeTodoFields(fields);
    assertValidTodo(normalized);
    return base
        ? repository.update(ownerKey, base, formPatch(base, normalized), now)
        : repository.create(ownerKey, clientId, normalized, now);
}

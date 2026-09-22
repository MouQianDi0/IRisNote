import {
    assertValidTodo,
    normalizeTodoFields,
} from "../domain/todo-validation";
import {
    TodoError,
    todoFormKeys,
    type TodoEntity,
    type TodoFields,
    type TodoVersionTarget,
} from "../todos.types";
import type { TodoRepository } from "./todo-repository.port";

export class TodoMemoryRepository implements TodoRepository {
    ownerKey: string | null = null;
    generation = 0;
    private entities = new Map<string, TodoEntity>();
    private listeners = new Set<() => void>();

    /** Hydrate an isolated working set; SQLite publishes it only after commit. */
    constructor(
        ownerKey: string | null = null,
        entities: readonly TodoEntity[] = [],
    ) {
        this.ownerKey = ownerKey;
        for (const entity of entities) {
            if (entity.ownerKey !== ownerKey)
                throw new TodoError("owner", "待办数据归属不匹配");
            this.entities.set(entity.clientId, Object.freeze({ ...entity }));
        }
    }

    activate(ownerKey: string) {
        if (this.ownerKey === ownerKey) return;
        this.ownerKey = ownerKey;
        this.generation += 1;
        this.entities = new Map();
        this.broadcast();
    }

    private assertOwner(ownerKey: string) {
        if (!ownerKey || this.ownerKey !== ownerKey)
            throw new TodoError("owner", "账号已变更，请重新打开待办");
    }

    list(ownerKey: string): readonly TodoEntity[] {
        this.assertOwner(ownerKey);
        return Array.from(this.entities.values());
    }

    get(ownerKey: string, clientId: string): TodoEntity {
        this.assertOwner(ownerKey);
        const entity = this.entities.get(clientId);
        if (!entity)
            throw new TodoError("missing", "该待办已被删除，请取消本次编辑");
        return entity;
    }

    create(
        ownerKey: string,
        clientId: string,
        fields: TodoFields,
        now: Date,
    ): TodoEntity {
        this.assertOwner(ownerKey);
        fields = normalizeTodoFields(fields);
        assertValidTodo(fields);
        if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                clientId,
            )
        )
            throw new TodoError("validation", "待办身份无效");
        const previous = this.entities.get(clientId);
        if (previous) {
            if (todoFormKeys.every((key) => previous[key] === fields[key]))
                return previous;
            throw new TodoError(
                "duplicate",
                "该创建会话已经保存，请从列表重新编辑",
            );
        }
        const entity = Object.freeze({
            ...fields,
            clientId,
            ownerKey,
            isCompleted: false,
            completedAt: null,
            localVersion: 1,
            createdAt: now.toISOString(),
            updatedAt: now.toISOString(),
        });
        this.entities.set(clientId, entity);
        this.broadcast();
        return entity;
    }

    update(
        ownerKey: string,
        base: TodoEntity,
        patch: Partial<TodoFields>,
        now: Date,
    ): TodoEntity {
        const current = this.get(ownerKey, base.clientId);
        if (
            base.ownerKey !== ownerKey ||
            !Number.isInteger(base.localVersion) ||
            base.localVersion < 1 ||
            base.localVersion > current.localVersion
        )
            throw new TodoError("conflict", "待办版本无效，请重新打开");
        for (const key of todoFormKeys) {
            if (
                Object.hasOwn(patch, key) &&
                current[key] !== base[key] &&
                current[key] !== patch[key]
            )
                throw new TodoError(
                    "conflict",
                    "该字段已被其他操作修改；输入已保留，请取消后重新打开",
                );
        }
        // Only known form fields can enter the candidate; completion and identity stay current.
        const candidate = { ...current };
        for (const key of todoFormKeys) {
            if (Object.hasOwn(patch, key))
                Object.assign(candidate, { [key]: patch[key] });
        }
        candidate.body = normalizeTodoFields(candidate).body;
        assertValidTodo(candidate);
        if (todoFormKeys.every((key) => candidate[key] === current[key]))
            return current;
        const entity = Object.freeze({
            ...candidate,
            localVersion: current.localVersion + 1,
            updatedAt: now.toISOString(),
        });
        this.entities.set(entity.clientId, entity);
        this.broadcast();
        return entity;
    }

    complete(
        ownerKey: string,
        base: TodoEntity,
        completed: boolean,
        now: Date,
    ): TodoEntity {
        const current = this.get(ownerKey, base.clientId);
        if (typeof completed !== "boolean")
            throw new TodoError("validation", "完成状态无效");
        if (
            current.localVersion !== base.localVersion ||
            base.ownerKey !== ownerKey
        )
            throw new TodoError("conflict", "待办已变化，请重试");
        if (current.isCompleted === completed) return current;
        const entity = Object.freeze({
            ...current,
            isCompleted: completed,
            completedAt: completed ? now.toISOString() : null,
            updatedAt: now.toISOString(),
            localVersion: current.localVersion + 1,
        });
        this.entities.set(entity.clientId, entity);
        this.broadcast();
        return entity;
    }

    private resolveTargets(
        ownerKey: string,
        targets: readonly TodoVersionTarget[],
    ): TodoEntity[] {
        this.assertOwner(ownerKey);
        if (
            new Set(targets.map((target) => target.clientId)).size !==
            targets.length
        )
            throw new TodoError("validation", "重复选择了待办");
        return targets.map((target) => {
            const entity = this.get(ownerKey, target.clientId);
            if (entity.localVersion !== target.localVersion)
                throw new TodoError(
                    "conflict",
                    "所选待办已变化，请取消确认后重新选择",
                );
            return entity;
        });
    }

    batch(
        ownerKey: string,
        targets: readonly TodoVersionTarget[],
        patch: Partial<Pick<TodoFields, "isStarred" | "isPinned">>,
        now: Date,
    ) {
        const current = this.resolveTargets(ownerKey, targets);
        const candidates = current.map((entity) => {
            const fields = { ...entity };
            for (const key of ["isStarred", "isPinned"] as const) {
                if (Object.hasOwn(patch, key)) fields[key] = patch[key]!;
            }
            assertValidTodo(fields);
            if (
                fields.isStarred === entity.isStarred &&
                fields.isPinned === entity.isPinned
            )
                return entity;
            return Object.freeze({
                ...fields,
                updatedAt: now.toISOString(),
                localVersion: entity.localVersion + 1,
            });
        });
        if (candidates.every((entity, index) => entity === current[index]))
            return;
        for (const entity of candidates)
            this.entities.set(entity.clientId, entity);
        this.broadcast();
    }

    delete(ownerKey: string, targets: readonly TodoVersionTarget[]) {
        const current = this.resolveTargets(ownerKey, targets);
        if (!current.length) return;
        for (const entity of current) this.entities.delete(entity.clientId);
        this.broadcast();
    }

    subscribe(listener: () => void) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private broadcast() {
        for (const listener of this.listeners) listener();
    }
}

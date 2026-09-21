import type {
  ApplicationDatabase,
  ApplicationDatabaseTransaction,
} from "@/core/database/database.types";
import { assertValidTodo } from "../domain/todo-validation";
import {
  TodoError,
  type TodoEntity,
  type TodoFields,
  type TodoVersionTarget,
} from "../todos.types";
import { TodoMemoryRepository } from "./todo-memory.repository";
import type { TodoRepository } from "./todo-repository.port";

export const LOCAL_GUEST_OWNER_KEY = "guest:local";

export type TodoRow = {
  owner_key: string;
  client_id: string;
  body: string;
  priority: TodoEntity["priority"];
  date_id: string;
  start_time: string | null;
  end_time: string | null;
  is_starred: number;
  is_pinned: number;
  reminder_enabled: number;
  time_zone: string | null;
  is_completed: number;
  completed_at: string | null;
  local_version: number;
  created_at: string;
  updated_at: string;
};

export function todoFromRow(row: TodoRow): TodoEntity {
  for (const value of [
    row.is_starred,
    row.is_pinned,
    row.reminder_enabled,
    row.is_completed,
  ]) {
    if (value !== 0 && value !== 1) throw new Error("待办存储布尔值无效");
  }
  if (
    !Number.isSafeInteger(row.local_version) ||
    row.local_version < 1 ||
    !row.owner_key ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      row.client_id,
    ) ||
    (row.is_completed === 1
      ? row.completed_at === null
      : row.completed_at !== null) ||
    [
      row.created_at,
      row.updated_at,
      ...(row.completed_at === null ? [] : [row.completed_at]),
    ].some((value) => !Number.isFinite(Date.parse(value)))
  )
    throw new Error("待办存储身份、版本或时间戳无效");
  const entity: TodoEntity = Object.freeze({
    ownerKey: row.owner_key,
    clientId: row.client_id,
    body: row.body,
    priority: row.priority,
    dateId: row.date_id,
    startTime: row.start_time,
    endTime: row.end_time,
    isStarred: row.is_starred === 1,
    isPinned: row.is_pinned === 1,
    reminderEnabled: row.reminder_enabled === 1,
    timeZone: row.time_zone,
    isCompleted: row.is_completed === 1,
    completedAt: row.completed_at,
    localVersion: row.local_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
  assertValidTodo(entity);
  return entity;
}

export const todoColumns =
  "owner_key, client_id, body, priority, date_id, start_time, end_time, is_starred, is_pinned, reminder_enabled, time_zone, is_completed, completed_at, local_version, created_at, updated_at";
const columns = todoColumns;
export function todoValues(entity: TodoEntity) {
  return [
    entity.ownerKey,
    entity.clientId,
    entity.body,
    entity.priority,
    entity.dateId,
    entity.startTime,
    entity.endTime,
    Number(entity.isStarred),
    Number(entity.isPinned),
    Number(entity.reminderEnabled),
    entity.timeZone,
    Number(entity.isCompleted),
    entity.completedAt,
    entity.localVersion,
    entity.createdAt,
    entity.updatedAt,
  ];
}
const values = todoValues;

export type TodoCommitObserver = (
  transaction: ApplicationDatabaseTransaction,
  ownerKey: string,
  before: readonly TodoEntity[],
  after: readonly TodoEntity[],
) => Promise<void>;

async function readOwner(
  database: ApplicationDatabaseTransaction,
  ownerKey: string,
) {
  const rows = await database.getAll<TodoRow>(
    `SELECT ${columns} FROM local_todos WHERE owner_key = ?`,
    [ownerKey],
  );
  return rows.map(todoFromRow);
}

/** SQLite is authoritative. The synchronous reads expose only the committed UI snapshot. */
export class TodoLocalRepository implements TodoRepository {
  ownerKey: string | null = null;
  generation = 0;
  ready = false;
  private database: ApplicationDatabase | null;
  private entities: readonly TodoEntity[] = [];
  private listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private activation: Promise<void> | null = null;

  constructor(
    database: ApplicationDatabase | null = null,
    private readonly onCommit?: TodoCommitObserver,
  ) {
    this.database = database;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const pending = this.queue.then(task);
    this.queue = pending.catch(() => undefined);
    return pending;
  }

  deactivate() {
    if (this.ownerKey === null) return;
    this.ownerKey = null;
    this.generation += 1;
    this.ready = false;
    this.entities = [];
    this.activation = null;
    this.broadcast();
  }

  activate(ownerKey: string, database = this.database): Promise<void> {
    if (!database || !ownerKey)
      return Promise.reject(new Error("待办数据库未就绪"));
    if (this.ownerKey === ownerKey && this.database === database) {
      if (this.activation) return this.activation;
      if (this.ready) return Promise.resolve();
    }
    this.database = database;
    this.ownerKey = ownerKey;
    const generation = ++this.generation;
    this.ready = false;
    this.entities = [];
    this.broadcast();
    const pending = this.enqueue(async () => {
      this.assertSession(ownerKey, generation);
      const entities = await readOwner(database, ownerKey);
      this.assertSession(ownerKey, generation);
      this.entities = Object.freeze(entities);
      this.ready = true;
      this.broadcast();
    });
    this.activation = pending;
    // Attach both branches to avoid creating an unhandled rejected finally promise.
    const clear = () => {
      if (this.activation === pending) this.activation = null;
    };
    void pending.then(clear, clear);
    return pending;
  }

  private assertSession(ownerKey: string, generation = this.generation) {
    if (
      !ownerKey ||
      this.ownerKey !== ownerKey ||
      this.generation !== generation
    )
      throw new TodoError("owner", "账号会话已失效，请重新打开待办");
  }

  list(ownerKey: string): readonly TodoEntity[] {
    this.assertSession(ownerKey);
    return this.entities;
  }

  get(ownerKey: string, clientId: string): TodoEntity {
    this.assertSession(ownerKey);
    const entity = this.entities.find((todo) => todo.clientId === clientId);
    if (!entity)
      throw new TodoError("missing", "该待办已被删除，请取消本次编辑");
    return entity;
  }

  private async mutate<T>(
    ownerKey: string,
    command: (working: TodoMemoryRepository) => T,
  ): Promise<T> {
    const generation = this.generation;
    const database = this.database;
    this.assertSession(ownerKey, generation);
    if (!database || !this.ready)
      throw new Error("待办尚未加载完成，请稍后重试");
    return this.enqueue(async () => {
      this.assertSession(ownerKey, generation);
      const committed = await database.transaction(async (transaction) => {
        this.assertSession(ownerKey, generation);
        const before = await readOwner(transaction, ownerKey);
        this.assertSession(ownerKey, generation);
        const working = new TodoMemoryRepository(ownerKey, before);
        const result = command(working);
        const after = working.list(ownerKey);
        const previous = new Map(
          before.map((entity) => [entity.clientId, entity]),
        );
        const nextIds = new Set(after.map((entity) => entity.clientId));
        for (const entity of after) {
          const old = previous.get(entity.clientId);
          if (old?.localVersion === entity.localVersion) continue;
          if (!old) {
            await transaction.run(
              `INSERT INTO local_todos (${columns}) VALUES (${values(entity)
                .map(() => "?")
                .join(", ")})`,
              values(entity),
            );
          } else {
            const updated = await transaction.run(
              `UPDATE local_todos SET ${columns
                .split(", ")
                .slice(2)
                .map((column) => `${column} = ?`)
                .join(
                  ", ",
                )} WHERE owner_key = ? AND client_id = ? AND local_version = ?`,
              [
                ...values(entity).slice(2),
                ownerKey,
                entity.clientId,
                old.localVersion,
              ],
            );
            if (updated.changes !== 1)
              throw new TodoError("conflict", "待办已变化，请重试");
          }
          this.assertSession(ownerKey, generation);
        }
        for (const entity of before) {
          if (nextIds.has(entity.clientId)) continue;
          const deleted = await transaction.run(
            "DELETE FROM local_todos WHERE owner_key = ? AND client_id = ? AND local_version = ?",
            [ownerKey, entity.clientId, entity.localVersion],
          );
          if (deleted.changes !== 1)
            throw new TodoError("conflict", "待办已变化，请重试");
          this.assertSession(ownerKey, generation);
        }
        await this.onCommit?.(transaction, ownerKey, before, after);
        this.assertSession(ownerKey, generation);
        return { result, entities: after };
      });
      // A scope change during COMMIT may leave a valid write for the old owner,
      // but must never publish that owner's data or close the new owner's form.
      this.assertSession(ownerKey, generation);
      const cached = new Map(
        this.entities.map((entity) => [entity.clientId, entity]),
      );
      const entities = committed.entities.map((entity) => {
        const previous = cached.get(entity.clientId);
        return previous?.localVersion === entity.localVersion
          ? previous
          : entity;
      });
      if (
        entities.length !== this.entities.length ||
        entities.some((entity, index) => entity !== this.entities[index])
      ) {
        this.entities = Object.freeze(entities);
        this.broadcast();
      }
      return committed.result;
    });
  }

  /** Cloud application uses the same queue as local edits, then publishes committed facts. */
  syncTransaction<T>(
    ownerKey: string,
    task: (tx: ApplicationDatabaseTransaction) => Promise<T>,
  ): Promise<T> {
    const generation = this.generation;
    const database = this.database;
    this.assertSession(ownerKey, generation);
    if (!database || !this.ready)
      return Promise.reject(new Error("待办数据库未就绪"));
    return this.enqueue(async () => {
      this.assertSession(ownerKey, generation);
      const result = await database.transaction(async (tx) => {
        this.assertSession(ownerKey, generation);
        const value = await task(tx);
        this.assertSession(ownerKey, generation);
        return { value, entities: await readOwner(tx, ownerKey) };
      });
      this.assertSession(ownerKey, generation);
      const prior = new Map(this.entities.map((item) => [item.clientId, item]));
      const next = result.entities.map((item) =>
        prior.get(item.clientId)?.localVersion === item.localVersion
          ? prior.get(item.clientId)!
          : item,
      );
      if (
        next.length !== this.entities.length ||
        next.some((item, i) => item !== this.entities[i])
      ) {
        this.entities = Object.freeze(next);
        this.broadcast();
      }
      return result.value;
    });
  }

  create(ownerKey: string, clientId: string, fields: TodoFields, now: Date) {
    const input = { ...fields };
    const instant = new Date(now);
    return this.mutate(ownerKey, (working) =>
      working.create(ownerKey, clientId, input, instant),
    );
  }

  update(
    ownerKey: string,
    base: TodoEntity,
    patch: Partial<TodoFields>,
    now: Date,
  ) {
    const input = { ...patch };
    const original = { ...base };
    const instant = new Date(now);
    return this.mutate(ownerKey, (working) =>
      working.update(ownerKey, original, input, instant),
    );
  }

  complete(ownerKey: string, base: TodoEntity, completed: boolean, now: Date) {
    const original = { ...base };
    const instant = new Date(now);
    return this.mutate(ownerKey, (working) =>
      working.complete(ownerKey, original, completed, instant),
    );
  }

  batch(
    ownerKey: string,
    targets: readonly TodoVersionTarget[],
    patch: Partial<Pick<TodoFields, "isStarred" | "isPinned">>,
    now: Date,
  ) {
    const input = { ...patch };
    const selected = targets.map((target) => ({ ...target }));
    const instant = new Date(now);
    return this.mutate(ownerKey, (working) =>
      working.batch(ownerKey, selected, input, instant),
    );
  }

  delete(ownerKey: string, targets: readonly TodoVersionTarget[]) {
    const selected = targets.map((target) => ({ ...target }));
    return this.mutate(ownerKey, (working) =>
      working.delete(ownerKey, selected),
    );
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

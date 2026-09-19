import type { TodoEntity, TodoFields, TodoVersionTarget } from "../todos.types";

export interface TodoRepository {
  readonly ownerKey: string | null;
  readonly generation: number;
  activate(ownerKey: string): void | Promise<void>;
  list(ownerKey: string): readonly TodoEntity[];
  get(ownerKey: string, clientId: string): TodoEntity;
  create(
    ownerKey: string,
    clientId: string,
    fields: TodoFields,
    now: Date,
  ): TodoEntity | Promise<TodoEntity>;
  update(
    ownerKey: string,
    base: TodoEntity,
    patch: Partial<TodoFields>,
    now: Date,
  ): TodoEntity | Promise<TodoEntity>;
  complete(
    ownerKey: string,
    base: TodoEntity,
    completed: boolean,
    now: Date,
  ): TodoEntity | Promise<TodoEntity>;
  batch(
    ownerKey: string,
    targets: readonly TodoVersionTarget[],
    patch: Partial<Pick<TodoFields, "isStarred" | "isPinned">>,
    now: Date,
  ): void | Promise<void>;
  delete(
    ownerKey: string,
    targets: readonly TodoVersionTarget[],
  ): void | Promise<void>;
  subscribe(listener: () => void): () => void;
}

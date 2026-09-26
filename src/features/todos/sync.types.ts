import type { TodoEntity } from "./todos.types";

export type TodoDTO = {
    id: number;
    client_id: string;
    user_id: number;
    body: string;
    priority: TodoEntity["priority"];
    date_id: string;
    start_time: string | null;
    end_time: string | null;
    is_starred: boolean;
    is_pinned: boolean;
    reminder_enabled: boolean;
    time_zone: string | null;
    is_completed: boolean;
    completed_at: string | null;
    created_at: string;
    updated_at: string;
    version: number;
    deleted_at: null;
};
export type TodoTombstone = {
    id: number;
    client_id: string;
    version: number;
    deleted_at: string;
};
export type TodoRemote = TodoDTO | TodoTombstone;
export type TodoBusiness = Omit<
    TodoDTO,
    | "id"
    | "client_id"
    | "user_id"
    | "created_at"
    | "updated_at"
    | "version"
    | "deleted_at"
>;
export type TodoRequest =
    | {
          kind: "create";
          body: TodoBusiness & { client_id: string; created_at: string };
      }
    | {
          kind: "patch";
          id: number;
          body: Partial<TodoBusiness> & { expected_version: number };
      }
    | {
          kind: "delete" | "set_starred" | "set_pinned";
          id: number;
          expected_version: number;
          value?: boolean;
      };
export type TodoOperation = {
    owner_key: string;
    client_id: string;
    operation_id: string;
    sequence: number;
    request: TodoRequest;
    attempts: number;
    next_attempt_at: number;
};
export type TodoSyncRecord = {
    ownerKey: string;
    clientId: string;
    sequence: number;
    candidate: TodoEntity;
    deleted: boolean;
    dirty: boolean;
    base: TodoRemote | null;
    remote: TodoRemote | null;
    status: "pending" | "synced" | "conflict" | "blocked";
    error: string | null;
};
export type TodoSnapshotPage = {
    data: TodoDTO[];
    page: {
        next_cursor: string | null;
        has_more: boolean;
        snapshot_token: string;
    };
    sync: { changes_cursor: string };
};
export type TodoChangesPage = {
    data: (
        | { change_seq: string; operation: "upsert"; data: TodoDTO }
        | (TodoTombstone & { change_seq: string; operation: "delete" })
    )[];
    page: { next_cursor: string; has_more: boolean };
};
export type TodoWriteResult = {
    data: TodoRemote;
    meta: {
        request_id: string;
        operation_id: string;
        replayed: boolean;
        changed: boolean;
    };
};
export type TodoBatchResult = {
    meta: {
        request_id: string;
        operation_id: string;
        replayed: boolean;
    };
    results: ({ operation_id: string; id: number; changed: boolean } & (
        | { status: "succeeded"; data: TodoRemote }
        | {
              status: "failed";
              error: { code: string; message: string };
              retryable: boolean;
              retry_after?: number;
              current?: TodoDTO;
              current_version?: number;
              data?: TodoTombstone;
          }
    ))[];
};

export class TodoApiError extends Error {
    constructor(
        public readonly status: number,
        public readonly code: string,
        message: string,
        public readonly retryAfter = 0,
        public readonly current: TodoRemote | null = null,
        public readonly requestId: string | null = null,
    ) {
        super(message);
        this.name = "TodoApiError";
    }
}
export const isDeleted = (remote: TodoRemote): remote is TodoTombstone =>
    remote.deleted_at !== null;

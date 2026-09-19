import type { Note } from "../notes.types";

export type CloudNote = {
    id: number;
    user_id: number;
    client_id: string;
    version: number;
    title: string;
    content: string | null;
    category_id: number | null;
    created_at: string;
    updated_at: string | null;
    sync_updated_at: string | null;
    deleted_at: null;
    is_pinned: boolean;
    is_starred: boolean;
};
export type NoteChange = { change_seq: string } & (
    | { operation: "upsert"; data: CloudNote }
    | {
          operation: "delete";
          id: number;
          client_id: string;
          version: number;
          deleted_at: string;
      }
);
export type SnapshotPage = {
    data: CloudNote[];
    page: {
        next_cursor: string | null;
        has_more: boolean;
        snapshot_token: string;
    };
    sync: { changes_cursor: string };
};
export type ChangesPage = {
    data: NoteChange[];
    page: { next_cursor: string; has_more: boolean };
};
export type SnapshotQuery = {
    limit: number;
    cursor?: string;
    snapshot_token?: string;
};
export type NotesSyncTransport = {
    snapshot: (
        owner: number,
        query: SnapshotQuery,
        signal: AbortSignal,
    ) => Promise<SnapshotPage>;
    changes: (
        owner: number,
        cursor: string,
        limit: number,
        signal: AbortSignal,
    ) => Promise<ChangesPage>;
};

const invalid = () => new Error("笔记同步响应无效，本地数据保持不变");
export function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw invalid();
    return value as Record<string, unknown>;
}
function integer(value: unknown): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
        throw invalid();
    return value;
}
function text(value: unknown): string {
    if (typeof value !== "string") throw invalid();
    return value;
}
function token(value: unknown): string {
    const result = text(value);
    if (!result || result.length > 2048) throw invalid();
    return result;
}
function uuid(value: unknown): string {
    const result = text(value);
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(result))
        throw invalid();
    return result;
}
function time(value: unknown): string {
    const result = text(value);
    if (
        !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result) ||
        !Number.isFinite(Date.parse(result))
    )
        throw invalid();
    return result;
}
function boolean(value: unknown): boolean {
    if (typeof value !== "boolean") throw invalid();
    return value;
}
export function parseCloudNote(value: unknown, owner: number): CloudNote {
    const row = object(value);
    if (row.user_id !== owner || row.deleted_at !== null) throw invalid();
    return {
        id: integer(row.id),
        user_id: owner,
        client_id: uuid(row.client_id),
        version: integer(row.version),
        title: text(row.title),
        content: row.content === null ? null : text(row.content),
        category_id: row.category_id === null ? null : integer(row.category_id),
        created_at: time(row.created_at),
        updated_at: row.updated_at === null ? null : time(row.updated_at),
        sync_updated_at:
            row.sync_updated_at === null ? null : time(row.sync_updated_at),
        deleted_at: null,
        is_pinned: boolean(row.is_pinned),
        is_starred: boolean(row.is_starred),
    };
}
export function parseSnapshot(value: unknown, owner: number): SnapshotPage {
    const row = object(value),
        page = object(row.page),
        sync = object(row.sync);
    if (!Array.isArray(row.data)) throw invalid();
    const hasMore = boolean(page.has_more);
    if (!hasMore && page.next_cursor !== null) throw invalid();
    return {
        data: row.data.map((item) => parseCloudNote(item, owner)),
        page: {
            has_more: hasMore,
            next_cursor: hasMore ? token(page.next_cursor) : null,
            snapshot_token: token(page.snapshot_token),
        },
        sync: { changes_cursor: token(sync.changes_cursor) },
    };
}
export function parseChanges(value: unknown, owner: number): ChangesPage {
    const row = object(value),
        page = object(row.page);
    if (!Array.isArray(row.data)) throw invalid();
    let previous = 0n;
    const data = row.data.map((item): NoteChange => {
        const change = object(item),
            seq = text(change.change_seq);
        if (
            !/^[1-9]\d{0,18}$/.test(seq) ||
            BigInt(seq) <= previous ||
            BigInt(seq) > 9223372036854775807n
        )
            throw invalid();
        previous = BigInt(seq);
        if (change.operation === "upsert")
            return {
                change_seq: seq,
                operation: "upsert",
                data: parseCloudNote(change.data, owner),
            };
        if (change.operation !== "delete") throw invalid();
        return {
            change_seq: seq,
            operation: "delete",
            id: integer(change.id),
            client_id: uuid(change.client_id),
            version: integer(change.version),
            deleted_at: time(change.deleted_at),
        };
    });
    return {
        data,
        page: {
            next_cursor: token(page.next_cursor),
            has_more: boolean(page.has_more),
        },
    };
}
export function cloudNoteToLocal(note: CloudNote): Note {
    return {
        ...note,
        server_id: note.id,
        server_updated_at: note.updated_at,
        current_revision_id: null,
        sync_status: "synced",
        sync_operation: null,
        last_sync_error: null,
    };
}

/** New sync endpoints return a structured error, unlike the legacy notes API. */
export function noteSyncErrorMessage(error: unknown): string {
    const failure = error as {
        response?: { data?: { error?: unknown } };
        message?: unknown;
    } | null;
    const value = failure?.response?.data?.error;
    if (typeof value === "string") return value;
    if (
        value &&
        typeof value === "object" &&
        "message" in value &&
        typeof value.message === "string"
    )
        return value.message;
    return typeof failure?.message === "string"
        ? failure.message
        : "笔记同步失败，已保留本地数据";
}

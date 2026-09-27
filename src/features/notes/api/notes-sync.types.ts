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
    is_pinned: boolean | null;
    is_starred: boolean | null;
};
/** `fields=meta` 返回的笔记：不含正文，改为正文摘要（服务端读取时计算）。 */
export type CloudNoteMeta = Omit<CloudNote, "content"> & {
    content_hash: string | null;
    content_length: number;
    content_preview: string | null;
};
/** 镜像中的一条记录：完整模式为 CloudNote，元数据模式为 CloudNoteMeta。 */
export type MirrorNote = CloudNote | CloudNoteMeta;
export type NoteFields = "meta";
export type NoteChange = { change_seq: string } & (
    | { operation: "upsert"; data: MirrorNote }
    | {
          operation: "delete";
          id: number;
          client_id: string;
          version: number;
          deleted_at: string;
      }
);
export type SnapshotPage = {
    data: MirrorNote[];
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
    fields?: NoteFields;
};
export type BatchPage = { data: CloudNote[]; missing: number[] };
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
        fields?: NoteFields,
    ) => Promise<ChangesPage>;
    /** 服务端是否支持元数据同步（第二期接口）；暂时无法判断时抛出。缺省视为不支持。 */
    supportsMeta?: () => Promise<boolean>;
    /** 按服务端 ID 批量取完整笔记（最多 50 个）。元数据模式下补正文使用。 */
    batch?: (
        owner: number,
        ids: readonly number[],
        signal: AbortSignal,
    ) => Promise<BatchPage>;
};

type SyncEndpoint =
    | "/api/notes/snapshot"
    | "/api/notes/changes"
    | "/api/notes/batch";
type ResponseContext = { endpoint: SyncEndpoint; status: number };

/** Only field paths, fixed expectations, and type names are retained; never response values. */
export class NotesSyncResponseError extends Error {
    readonly response?: { status: number };
    constructor(
        readonly field: string,
        readonly expected: string,
        readonly actual: string,
        readonly context?: ResponseContext,
    ) {
        const location = context
            ? ` [${context.endpoint}，HTTP ${context.status}]`
            : "";
        super(
            `笔记同步响应无效${location}：${field}，期望 ${expected}，实际 ${actual}；本地数据保持不变`,
        );
        this.name = "NotesSyncResponseError";
        if (context) this.response = { status: context.status };
    }
}
function valueType(value: unknown): string {
    if (value === null) return "null";
    if (Array.isArray(value)) return "array";
    return typeof value;
}
function invalid(field: string, expected: string, value: unknown, reason = "") {
    return new NotesSyncResponseError(
        field,
        expected,
        valueType(value) + reason,
    );
}
export function withSyncResponseContext<T>(
    endpoint: SyncEndpoint,
    status: number,
    parse: () => T,
): T {
    try {
        return parse();
    } catch (error) {
        if (error instanceof NotesSyncResponseError) {
            throw new NotesSyncResponseError(
                error.field,
                error.expected,
                error.actual,
                { endpoint, status },
            );
        }
        throw error;
    }
}
export function object(
    value: unknown,
    field = "$response",
): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw invalid(field, "object", value);
    return value as Record<string, unknown>;
}
function integer(value: unknown, field: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
        throw invalid(field, "正的安全整数", value);
    return value;
}
function text(value: unknown, field: string): string {
    if (typeof value !== "string") throw invalid(field, "string", value);
    return value;
}
function token(value: unknown, field: string): string {
    const result = text(value, field);
    if (!result || result.length > 2048)
        throw invalid(field, "非空且不超过 2048 字符的 string", value);
    return result;
}
function uuid(value: unknown, field: string): string {
    const result = text(value, field);
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(result))
        throw invalid(field, "UUID string", value, "（格式不符）");
    return result;
}
function time(value: unknown, field: string): string {
    const result = text(value, field);
    if (
        !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(result) ||
        !Number.isFinite(Date.parse(result))
    )
        throw invalid(field, "带时区的有效时间 string", value, "（格式不符）");
    return result;
}
function boolean(value: unknown, field: string): boolean {
    if (typeof value !== "boolean") throw invalid(field, "boolean", value);
    return value;
}
export function parseCloudNote(
    value: unknown,
    owner: number,
    field = "note",
): CloudNote {
    const row = object(value, field);
    const at = (key: string) => `${field}.${key}`;
    if (row.user_id !== owner)
        throw invalid(
            at("user_id"),
            "当前登录账号的用户 ID",
            row.user_id,
            "（账号不匹配）",
        );
    if (row.deleted_at !== null)
        throw invalid(at("deleted_at"), "null（活动笔记）", row.deleted_at);
    return {
        id: integer(row.id, at("id")),
        user_id: owner,
        client_id: uuid(row.client_id, at("client_id")),
        version: integer(row.version, at("version")),
        title: text(row.title, at("title")),
        content: row.content === null ? null : text(row.content, at("content")),
        category_id:
            row.category_id === null
                ? null
                : integer(row.category_id, at("category_id")),
        created_at: time(row.created_at, at("created_at")),
        updated_at:
            row.updated_at === null
                ? null
                : time(row.updated_at, at("updated_at")),
        sync_updated_at:
            row.sync_updated_at === null
                ? null
                : time(row.sync_updated_at, at("sync_updated_at")),
        deleted_at: null,
        // Legacy server records may retain NULL; missing or non-boolean values still fail.
        is_pinned:
            row.is_pinned === null
                ? null
                : boolean(row.is_pinned, at("is_pinned")),
        is_starred:
            row.is_starred === null
                ? null
                : boolean(row.is_starred, at("is_starred")),
    };
}
export function isCloudNoteMeta(note: MirrorNote): note is CloudNoteMeta {
    return "content_hash" in note;
}
export function parseCloudNoteMeta(
    value: unknown,
    owner: number,
    field = "note",
): CloudNoteMeta {
    const row = object(value, field);
    const at = (key: string) => `${field}.${key}`;
    if ("content" in row)
        throw invalid(at("content"), "不存在（元数据模式）", row.content);
    const { content: _content, ...base } = parseCloudNote(
        { ...row, content: null },
        owner,
        field,
    );
    const hash =
        row.content_hash === null
            ? null
            : text(row.content_hash, at("content_hash"));
    if (hash !== null && !/^[0-9a-f]{64}$/.test(hash))
        throw invalid(
            at("content_hash"),
            "64 位小写十六进制 string",
            row.content_hash,
            "（格式不符）",
        );
    const length = row.content_length;
    if (
        typeof length !== "number" ||
        !Number.isSafeInteger(length) ||
        length < 0
    )
        throw invalid(at("content_length"), "非负安全整数", length);
    const preview =
        row.content_preview === null
            ? null
            : text(row.content_preview, at("content_preview"));
    if ((hash === null) !== (preview === null) || (hash === null && length))
        throw invalid(
            at("content_hash"),
            "与正文长度和摘要一致",
            row.content_hash,
            "（互相矛盾）",
        );
    return {
        ...base,
        content_hash: hash,
        content_length: length,
        content_preview: preview,
    };
}
/** 按记录自身格式解析：带 content_hash 的是元数据，否则是完整笔记。镜像切换模式期间两种格式可能并存。 */
export function parseMirrorNote(
    value: unknown,
    owner: number,
    field = "note",
): MirrorNote {
    const row = object(value, field);
    return "content_hash" in row
        ? parseCloudNoteMeta(row, owner, field)
        : parseCloudNote(row, owner, field);
}
export function parseBatch(value: unknown, owner: number): BatchPage {
    const row = object(value);
    if (!Array.isArray(row.data)) throw invalid("data", "array", row.data);
    if (!Array.isArray(row.missing))
        throw invalid("missing", "array", row.missing);
    return {
        data: row.data.map((item, index) =>
            parseCloudNote(item, owner, `data[${index}]`),
        ),
        missing: row.missing.map((id, index) =>
            integer(id, `missing[${index}]`),
        ),
    };
}
export function parseSnapshot(value: unknown, owner: number): SnapshotPage {
    const row = object(value),
        page = object(row.page, "page"),
        sync = object(row.sync, "sync");
    if (!Array.isArray(row.data)) throw invalid("data", "array", row.data);
    const hasMore = boolean(page.has_more, "page.has_more");
    if (!hasMore && page.next_cursor !== null)
        throw invalid("page.next_cursor", "null（快照末页）", page.next_cursor);
    return {
        data: row.data.map((item, index) =>
            parseMirrorNote(item, owner, `data[${index}]`),
        ),
        page: {
            has_more: hasMore,
            next_cursor: hasMore
                ? token(page.next_cursor, "page.next_cursor")
                : null,
            snapshot_token: token(page.snapshot_token, "page.snapshot_token"),
        },
        sync: {
            changes_cursor: token(sync.changes_cursor, "sync.changes_cursor"),
        },
    };
}
export function parseChanges(value: unknown, owner: number): ChangesPage {
    const row = object(value),
        page = object(row.page, "page");
    if (!Array.isArray(row.data)) throw invalid("data", "array", row.data);
    let previous = 0n;
    const data = row.data.map((item, index): NoteChange => {
        const field = `data[${index}]`;
        const change = object(item, field),
            seq = text(change.change_seq, `${field}.change_seq`);
        if (
            !/^[1-9]\d{0,18}$/.test(seq) ||
            BigInt(seq) <= previous ||
            BigInt(seq) > 9223372036854775807n
        )
            throw invalid(
                `${field}.change_seq`,
                "严格递增的正 int64 十进制 string",
                change.change_seq,
                "（格式、范围或顺序不符）",
            );
        previous = BigInt(seq);
        if (change.operation === "upsert")
            return {
                change_seq: seq,
                operation: "upsert",
                data: parseMirrorNote(change.data, owner, `${field}.data`),
            };
        if (change.operation !== "delete")
            throw invalid(
                `${field}.operation`,
                '"upsert" 或 "delete"',
                change.operation,
            );
        return {
            change_seq: seq,
            operation: "delete",
            id: integer(change.id, `${field}.id`),
            client_id: uuid(change.client_id, `${field}.client_id`),
            version: integer(change.version, `${field}.version`),
            deleted_at: time(change.deleted_at, `${field}.deleted_at`),
        };
    });
    return {
        data,
        page: {
            next_cursor: token(page.next_cursor, "page.next_cursor"),
            has_more: boolean(page.has_more, "page.has_more"),
        },
    };
}
export function cloudNoteToLocal(note: CloudNote): Note {
    return {
        ...note,
        // Preserve nullable values in the cloud mirror, normalize only for local business use.
        is_pinned: note.is_pinned ?? false,
        is_starred: note.is_starred ?? false,
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

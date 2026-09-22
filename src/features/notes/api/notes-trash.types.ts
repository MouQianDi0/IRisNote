import { parseCloudNote, type CloudNote } from "./notes-sync.types";

export const NOTE_TRASH_MS = 15 * 24 * 60 * 60 * 1000;
export type NoteDeletion = {
    id: number;
    client_id: string;
    version: number;
    deleted_at: string;
    expires_at: string;
};
export type DeletedCloudNote = Omit<CloudNote, "deleted_at"> & NoteDeletion;
export type TrashPage = {
    data: DeletedCloudNote[];
    expired: NoteDeletion[];
    server_now: string;
};
export type TrashState =
    | { state: "active"; note: CloudNote }
    | { state: "deleted"; note: DeletedCloudNote }
    | { state: "expired" | "purged"; deletion: NoteDeletion };
const invalid = () => new Error("垃圾桶响应格式无效，请稍后重试");
function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw invalid();
    return value as Record<string, unknown>;
}
function timestamp(value: unknown): string {
    if (
        typeof value !== "string" ||
        !/^\d{4}-\d\d-\d\dT.*Z$/.test(value) ||
        !Number.isFinite(Date.parse(value))
    )
        throw invalid();
    return new Date(value).toISOString();
}
export function parseDeletion(value: unknown): NoteDeletion {
    const row = object(value);
    if (
        typeof row.id !== "number" ||
        !Number.isSafeInteger(row.id) ||
        row.id <= 0 ||
        typeof row.version !== "number" ||
        !Number.isSafeInteger(row.version) ||
        row.version < 1 ||
        typeof row.client_id !== "string" ||
        !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(row.client_id)
    )
        throw invalid();
    const deleted_at = timestamp(row.deleted_at),
        expires_at = timestamp(row.expires_at);
    if (Date.parse(expires_at) - Date.parse(deleted_at) !== NOTE_TRASH_MS)
        throw invalid();
    return {
        id: row.id,
        client_id: row.client_id,
        version: row.version,
        deleted_at,
        expires_at,
    };
}
export function parseDeletedNote(
    value: unknown,
    owner: number,
): DeletedCloudNote {
    const row = object(value),
        receipt = parseDeletion(row);
    return {
        ...parseCloudNote({ ...row, deleted_at: null }, owner),
        ...receipt,
    };
}
export function parseTrashPage(value: unknown, owner: number): TrashPage {
    const row = object(value);
    if (!Array.isArray(row.data) || !Array.isArray(row.expired))
        throw invalid();
    const data = row.data.map((note) => parseDeletedNote(note, owner)),
        expired = row.expired.map(parseDeletion);
    const ids = [...data, ...expired].map((note) => note.id);
    if (new Set(ids).size !== ids.length) throw invalid();
    return { data, expired, server_now: timestamp(row.server_now) };
}
export function parseTrashState(
    value: unknown,
    owner: number,
    id: number,
): TrashState {
    const row = object(value);
    if (row.state === "active" || row.state === "deleted") {
        const result =
            row.state === "active"
                ? {
                      state: "active" as const,
                      note: parseCloudNote(row.note, owner),
                  }
                : {
                      state: "deleted" as const,
                      note: parseDeletedNote(row.note, owner),
                  };
        if (result.note.id !== id) throw invalid();
        return result;
    }
    if (row.state !== "expired" && row.state !== "purged") throw invalid();
    const receipt = parseDeletion(row.deletion);
    if (receipt.id !== id) throw invalid();
    return { state: row.state, deletion: receipt };
}

export function remainingTrashTime(
    expiresAt: string | null,
    now: number,
): string {
    if (!expiresAt) return "正在确认删除时间";
    const remaining = Date.parse(expiresAt) - now;
    if (remaining <= 0) return "已到期，等待清理";
    if (remaining >= 86400000)
        return `剩余 ${Math.ceil(remaining / 86400000)} 天`;
    if (remaining >= 3600000)
        return `剩余 ${Math.floor(remaining / 3600000)} 小时 ${Math.floor((remaining % 3600000) / 60000)} 分钟`;
    return `剩余 ${Math.max(1, Math.ceil(remaining / 60000))} 分钟`;
}

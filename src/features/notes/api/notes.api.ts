import api from "@/shared/http/client";
import type {
    CreateNotePayload,
    Note,
    ServerNote,
    UpdateNotePayload,
} from "@/features/notes/notes.types";
import { isAxiosError, type AxiosProgressEvent } from "axios";
import { markNotesServerV2 } from "./notes-capability";
import { parseCloudNote, type CloudNote } from "./notes-sync.types";

export type {
    CreateNotePayload,
    Note,
    UpdateNotePayload,
} from "@/features/notes/notes.types";

export type NoteUploadOptions = {
    onUploadProgress?: (event: AxiosProgressEvent) => void;
    onResponse?: (status: number) => void;
    /** 仅新建：带上后服务端按此键去重，重试必须原样发送同一请求体。 */
    idempotencyKey?: string;
};

const normalizeNote = (note: ServerNote): Note => ({
    ...note,
    server_id: note.id,
    content: note.content ?? null,
    category_id: note.category_id ?? null,
    current_revision_id: null,
    updated_at: note.updated_at ?? null,
    server_updated_at: note.updated_at ?? null,
    sync_status: "synced",
    sync_operation: null,
    last_sync_error: null,
});

function assertServerNote(note: unknown, expectedId?: number) {
    if (
        !note ||
        typeof note !== "object" ||
        !Number.isInteger((note as ServerNote).id) ||
        (note as ServerNote).id <= 0 ||
        typeof (note as ServerNote).title !== "string" ||
        typeof (note as ServerNote).created_at !== "string"
    ) {
        throw new Error(
            "[Notes API] Server returned an invalid note response.",
        );
    }

    if (expectedId != null && (note as ServerNote).id !== expectedId) {
        throw new Error(
            "[Notes API] Updated note id does not match request id.",
        );
    }

    const updatedAt = (note as ServerNote).updated_at;
    if (
        updatedAt != null &&
        (typeof updatedAt !== "string" ||
            !Number.isFinite(Date.parse(updatedAt)))
    ) {
        throw new Error(
            "[Notes API] Server returned an invalid edit timestamp.",
        );
    }

    return note as ServerNote;
}

/** 只接受通过普通笔记响应校验且属于当前笔记的冲突快照。 */
export function normalizeConflictNote(
    value: unknown,
    expectedId: number,
): Note {
    return normalizeNote(assertServerNote(value, expectedId));
}

export async function getNotes(): Promise<Note[]> {
    const { data } = await api.get<ServerNote[]>("/notes");
    if (!Array.isArray(data)) {
        throw new Error("[Notes API] Server returned an invalid notes list.");
    }
    return data.map((note) => normalizeNote(assertServerNote(note)));
}

/**
 * 幂等新建的回执：新服务端返回 `{data, meta}`，旧服务端忽略请求头、直接返回笔记（返回 null）。
 * 回执必须对应本次的幂等键与云端身份，否则视为无效响应。
 */
function createReceipt(value: unknown, key: string, cloudId?: string) {
    if (!value || typeof value !== "object" || !("meta" in value))
        return null;
    const { data, meta } = value as { data?: unknown; meta?: unknown };
    if (
        !meta ||
        typeof meta !== "object" ||
        (meta as { operation_id?: unknown }).operation_id !== key ||
        !data ||
        typeof data !== "object" ||
        (cloudId !== undefined &&
            (data as { client_id?: unknown }).client_id !== cloudId)
    ) {
        throw new Error(
            "[Notes API] Server returned an invalid idempotent create receipt.",
        );
    }
    return data;
}

export async function createNote(
    payload: CreateNotePayload,
    options: NoteUploadOptions = {},
): Promise<Note> {
    const key = options.idempotencyKey;
    const response = await api.post<unknown>("/notes", payload, {
        onUploadProgress: options.onUploadProgress,
        ...(key ? { headers: { "Idempotency-Key": key } } : {}),
    });
    options.onResponse?.(response.status);
    if (!key) return normalizeNote(assertServerNote(response.data));
    const receipt = createReceipt(response.data, key, payload.client_id);
    markNotesServerV2(receipt !== null);
    return normalizeNote(assertServerNote(receipt ?? response.data));
}

/**
 * 判断服务端是否支持第二期接口：新服务端的批量接口返回 `{data, missing}`，旧服务端没有该路由（404）。
 * 其他结果（离线、5xx、云存储未授权）无法判断，原样抛出。
 */
export async function probeNotesServer(): Promise<boolean> {
    try {
        const response = await api.get<unknown>("/notes/batch", {
            params: { ids: "1" },
        });
        const body = response.data as {
            data?: unknown;
            missing?: unknown;
        } | null;
        if (Array.isArray(body?.data) && Array.isArray(body?.missing))
            return true;
        throw new Error("[Notes API] Server returned an invalid batch response.");
    } catch (error) {
        if (isAxiosError(error) && error.response?.status === 404) return false;
        throw error;
    }
}

/** 按服务端 ID 取一篇活动笔记（第二期接口）；已删除返回 410，不存在返回 404。 */
export async function fetchCloudNote(
    owner: number,
    serverId: number,
): Promise<CloudNote> {
    if (!Number.isInteger(serverId) || serverId <= 0) {
        throw new Error("[Notes API] A positive server note id is required.");
    }
    const response = await api.get<unknown>(`/notes/${serverId}`);
    const note = parseCloudNote(response.data, owner);
    if (note.id !== serverId) {
        throw new Error("[Notes API] Fetched note id does not match request id.");
    }
    return note;
}

export async function updateNote(
    noteId: number,
    payload: UpdateNotePayload,
    options: NoteUploadOptions = {},
): Promise<Note> {
    if (!Number.isInteger(noteId) || noteId <= 0) {
        throw new Error("[Notes API] A positive server note id is required.");
    }

    const response = await api.put<ServerNote>(`/notes/${noteId}`, payload, {
        onUploadProgress: options.onUploadProgress,
    });
    options.onResponse?.(response.status);
    return normalizeNote(assertServerNote(response.data, noteId));
}

export async function deleteNote(
    noteId: number,
): Promise<{ success: boolean }> {
    const { data } = await api.delete<{ success: boolean }>(`/notes/${noteId}`);
    return data;
}

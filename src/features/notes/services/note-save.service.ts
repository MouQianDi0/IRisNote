import type { ApplicationDatabase } from "@/core/database";
import { deleteNoteDraft, type DraftCommit } from "../data/note-draft.repository";
import { getApiErrorMessage } from "@/shared/http/errors";
import { isAxiosError, type AxiosProgressEvent } from "axios";
import { createNote, updateNote } from "../api/notes.api";
import {
    acceptServerNote,
    createPendingLocalNote,
    markLocalNoteSynced,
    markLocalNoteSyncFailed,
    markLocalNoteSyncing,
    updatePendingLocalNote,
} from "../data/note-local.repository";
import { setCachedNote } from "../notes.cache";
import { notifyNotesChanged } from "../notes.events";
import type {
    CreateNotePayload,
    Note,
    UpdateNotePayload,
} from "../notes.types";

export type NoteCloudSaveState = "accepted" | "rejected" | "unknown";

export type NoteSaveResult = {
    draftCleanupPending?: boolean;
    note: Note;
    cloudState: NoteCloudSaveState;
    /** true 表示内容与当前版本一致，本次保存没有创建新版本。 */
    unchanged?: boolean;
    message?: string;
};

function publishNote(note: Note) {
    setCachedNote(note);
    notifyNotesChanged({ type: "upsert", note });
}

function notifyLocalSaved(note: Note, callback?: (note: Note) => void) {
    try { callback?.(note); } catch { console.warn("[Note save] 状态提示失败，本地保存与同步继续"); }
}

function logUploadProgress(clientId: number, event: AxiosProgressEvent) {
    const total = event.total;
    const percent =
        typeof total === "number" && total > 0
            ? Math.min(100, Math.round((event.loaded / total) * 100))
            : undefined;

    console.log("[Note sync] 上传云端进度", {
        clientId,
        loaded: event.loaded,
        total: total ?? null,
        percent: percent ?? null,
    });
}

function classifyCloudFailure(error: unknown): Exclude<
    NoteCloudSaveState,
    "accepted"
> {
    return isAxiosError(error) && error.response ? "rejected" : "unknown";
}

async function syncPendingNote(
    database: ApplicationDatabase,
    ownerUserId: number,
    note: Note,
): Promise<NoteSaveResult> {
    const syncingNote = await markLocalNoteSyncing(
        database,
        ownerUserId,
        note.id,
    );
    if (syncingNote) publishNote(syncingNote);

    console.log("[Note sync] 开始上传云端", {
        clientId: note.id,
        serverId: note.server_id ?? null,
        operation: note.sync_operation,
    });

    try {
        let responseStatus: number | undefined;
        const uploadOptions = {
            onUploadProgress: (event: AxiosProgressEvent) =>
                logUploadProgress(note.id, event),
            onResponse: (status: number) => {
                responseStatus = status;
                console.log("[Note sync] 已收到云端响应", {
                    clientId: note.id,
                    status,
                });
            },
        };
        const serverNote =
            note.sync_operation === "create" || note.server_id == null
                ? await createNote(
                      {
                          title: note.title,
                          content: note.content ?? "",
                          ...(note.category_id == null
                              ? {}
                              : { category_id: note.category_id }),
                      },
                      uploadOptions,
                  )
                : await updateNote(
                      note.server_id,
                      {
                          title: note.title,
                          content: note.content,
                          category_id: note.category_id,
                      },
                      uploadOptions,
                  );
        const acceptedNote = await acceptServerNote(
            database,
            ownerUserId,
            note.id,
            serverNote,
        );
        if (!acceptedNote) {
            throw new Error("[Note sync] Accepted note could not be reloaded.");
        }

        publishNote(acceptedNote);
        console.log("[Note sync] 云端已接受笔记", {
            clientId: acceptedNote.id,
            serverId: acceptedNote.server_id,
            httpStatus: responseStatus ?? null,
            status: acceptedNote.sync_status,
        });
        return { note: acceptedNote, cloudState: "accepted" };
    } catch (error: unknown) {
        const cloudState = classifyCloudFailure(error);
        const message = getApiErrorMessage(error, "云端同步失败");
        const failedNote = await markLocalNoteSyncFailed(
            database,
            ownerUserId,
            note.id,
            cloudState,
            message,
        );
        if (!failedNote) throw error;

        publishNote(failedNote);
        console.error(
            cloudState === "rejected"
                ? "[Note sync] 云端明确拒绝笔记"
                : "[Note sync] 云端是否接收未知",
            {
                clientId: note.id,
                serverId: note.server_id ?? null,
                message,
            },
        );
        return { note: failedNote, cloudState, message };
    }
}

export async function saveNewNoteLocalFirst(
    database: ApplicationDatabase,
    ownerUserId: number,
    payload: CreateNotePayload,
    draft?: DraftCommit,
    onLocalSaved?: (note: Note) => void,
) {
    const { note: localNote } = await createPendingLocalNote(
        database,
        ownerUserId,
        payload,
        draft,
    );
    publishNote(localNote);
    notifyLocalSaved(localNote, onLocalSaved);
    console.log("[Note save] 新笔记已保存到本地", {
        clientId: localNote.id,
        syncStatus: localNote.sync_status,
    });
    return finishDraftSave(database, ownerUserId, localNote, draft, false);
}

export async function saveEditedNoteLocalFirst(
    database: ApplicationDatabase,
    ownerUserId: number,
    note: Note,
    payload: UpdateNotePayload,
    draft?: DraftCommit,
    onLocalSaved?: (note: Note) => void,
) {
    const { note: localNote, revisionCreated } = await updatePendingLocalNote(
        database,
        ownerUserId,
        note,
        payload,
        draft,
    );
    publishNote(localNote);
    notifyLocalSaved(localNote, onLocalSaved);
    console.log("[Note save] 笔记改动已保存到本地", {
        clientId: localNote.id,
        serverId: localNote.server_id ?? null,
        syncStatus: localNote.sync_status,
        revisionCreated,
    });

    if (note.server_id == null && note.sync_status === "unknown") {
        const message =
            "此前创建请求结果未知；为避免重复创建，本次仅保存本地改动。";
        const unknownNote = await markLocalNoteSyncFailed(
            database,
            ownerUserId,
            localNote.id,
            "unknown",
            message,
        );
        if (!unknownNote) {
            throw new Error("[Note sync] Unknown note could not be reloaded.");
        }
        publishNote(unknownNote);
        console.warn("[Note sync] 跳过结果未知的新建重试", {
            clientId: unknownNote.id,
        });
        return {
            note: unknownNote,
            cloudState: "unknown" as const,
            unchanged: !revisionCreated,
            message,
        };
    }

    // 无变化且此前已同步：云端已是相同内容，不重复上传、不创建版本。
    const wasSynced =
        note.sync_status === "synced" &&
        (note.server_id ?? localNote.server_id) != null;
    if (!revisionCreated && wasSynced) {
        const syncedNote = await markLocalNoteSynced(
            database,
            ownerUserId,
            localNote.id,
        );
        if (!syncedNote) {
            throw new Error("[Note save] Unchanged note could not be reloaded.");
        }
        publishNote(syncedNote);
        let draftCleanupPending = false;
        if (draft?.beforeDelete) {
            try { await deleteNoteDraft(database, ownerUserId, draft); }
            catch {
                draftCleanupPending = true;
                console.warn("[Note draft] 保存已完成，草稿清理未完成", { clientId: syncedNote.id });
            }
        }
        console.info("[Note save] 内容未变化，未创建新版本", {
            clientId: syncedNote.id,
        });
        return { note: syncedNote, cloudState: "accepted", unchanged: true, draftCleanupPending };
    }

    return finishDraftSave(
        database,
        ownerUserId,
        localNote,
        draft,
        !revisionCreated,
    );
}

async function finishDraftSave(
    database: ApplicationDatabase, owner: number, note: Note, draft?: DraftCommit,
    unchanged = false,
) {
    const result = await syncPendingNote(database, owner, note);
    const saveResult: NoteSaveResult = { ...result, unchanged };
    if (draft && result.cloudState === "accepted") {
        try {
            await deleteNoteDraft(database, owner, draft);
        } catch {
            if (draft.beforeDelete) saveResult.draftCleanupPending = true;
            // 云端保存成功不能因草稿清理失败被误报为保存失败，也不能删除新会话内容。
            console.warn("[Note draft] 保存已完成，草稿清理未完成", { clientId: note.id });
        }
    }
    return saveResult;
}

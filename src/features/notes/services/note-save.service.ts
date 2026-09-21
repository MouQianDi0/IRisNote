import type { ApplicationDatabase } from "@/core/database";
import { enqueueNoteUpload } from "@/features/sync/note-upload-queue";
import { getApiErrorMessage } from "@/shared/http/errors";
import { isAxiosError, type AxiosProgressEvent } from "axios";
import {
    createNote,
    normalizeConflictNote,
    updateNote,
} from "../api/notes.api";
import {
    deleteNoteDraft,
    type DraftCommit,
} from "../data/note-draft.repository";
import {
    acceptServerNote,
    createPendingLocalNote,
    getLocalNoteByClientId,
    markLocalNoteSynced,
    markLocalNoteSyncFailed,
    markLocalNoteSyncing,
    reconcileServerNotes,
    updatePendingLocalNote,
} from "../data/note-local.repository";
import { setCachedNote } from "../notes.cache";
import { beginNoteCloudWrite, notifyNotesChanged } from "../notes.events";
import type {
    CreateNotePayload,
    Note,
    UpdateNotePayload,
} from "../notes.types";

export type NoteCloudSaveState = "accepted" | "queued" | "rejected" | "unknown";

export type NoteSaveResult = {
    draftCleanupPending?: boolean;
    note: Note;
    cloudState: NoteCloudSaveState;
    /** true 表示内容与当前版本一致，本次保存没有创建新版本。 */
    unchanged?: boolean;
    message?: string;
    httpStatus?: number;
    retryable?: boolean;
};

export type StagedEditedNoteResult = {
    note: Note;
    shouldUpload: boolean;
    cloudState?: NoteCloudSaveState;
    unchanged: boolean;
    draftCleanupPending?: boolean;
    message?: string;
    httpStatus?: number;
    retryable?: boolean;
};

function publishNote(note: Note) {
    setCachedNote(note);
    notifyNotesChanged({ type: "upsert", note });
}

function notifyLocalSaved(note: Note, callback?: (note: Note) => void) {
    try {
        callback?.(note);
    } catch {
        console.warn("[Note save] 状态提示失败，本地保存与同步继续");
    }
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

function classifyCloudFailure(
    error: unknown,
): Exclude<NoteCloudSaveState, "accepted" | "queued"> {
    return isAxiosError(error) && error.response ? "rejected" : "unknown";
}

async function syncPendingNote(
    database: ApplicationDatabase,
    ownerUserId: number,
    note: Note,
    onUploadProgress?: (event: AxiosProgressEvent) => void,
): Promise<NoteSaveResult> {
    const finish = beginNoteCloudWrite();
    try {
        return await syncPendingNoteWithReceipt(
            database,
            ownerUserId,
            note,
            onUploadProgress,
        );
    } finally {
        finish();
    }
}

async function syncPendingNoteWithReceipt(
    database: ApplicationDatabase,
    ownerUserId: number,
    note: Note,
    onUploadProgress?: (event: AxiosProgressEvent) => void,
): Promise<NoteSaveResult> {
    if (
        note.server_id != null &&
        note.last_sync_error?.startsWith("云端笔记已删除")
    ) {
        return {
            note,
            cloudState: "rejected",
            message: note.last_sync_error,
            httpStatus: 404,
            retryable: false,
        };
    }
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
            onUploadProgress: (event: AxiosProgressEvent) => {
                logUploadProgress(note.id, event);
                onUploadProgress?.(event);
            },
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
                          ...(note.updated_at
                              ? { updated_at: note.updated_at }
                              : {}),
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
                          updated_at: note.updated_at ?? null,
                      },
                      uploadOptions,
                  );
        const acceptedNote = await acceptServerNote(
            database,
            ownerUserId,
            note.id,
            serverNote,
            note.current_revision_id ?? null,
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
        return {
            note: acceptedNote,
            cloudState:
                acceptedNote.sync_status === "synced" ? "accepted" : "queued",
            retryable: acceptedNote.sync_status !== "synced",
        };
    } catch (error: unknown) {
        if (
            isAxiosError<{ code?: string; note?: unknown }>(error) &&
            error.response?.status === 409 &&
            error.response.data?.code === "NOTE_EDIT_CONFLICT" &&
            note.server_id != null
        ) {
            try {
                const remote = normalizeConflictNote(
                    error.response.data.note,
                    note.server_id,
                );
                await reconcileServerNotes(
                    database,
                    ownerUserId,
                    [remote],
                    undefined,
                    {
                        clientId: note.id,
                        revisionId: note.current_revision_id ?? null,
                    },
                );
                const current = await getLocalNoteByClientId(
                    database,
                    ownerUserId,
                    note.id,
                );
                if (current?.sync_status === "synced") {
                    publishNote(current);
                    return {
                        note: current,
                        cloudState: "accepted",
                        message: "已同步云端较新的内容，本地历史版本已保留。",
                    };
                }
                if (
                    current &&
                    current.current_revision_id !== note.current_revision_id
                ) {
                    publishNote(current);
                    return {
                        note: current,
                        cloudState: "queued",
                        retryable: true,
                    };
                }
            } catch {
                // 无效冲突快照/本地合并失败走普通失败处理，不能把未落库的内容标为成功。
            }
        }
        const cloudState = classifyCloudFailure(error);
        const httpStatus = isAxiosError(error)
            ? error.response?.status
            : undefined;
        const retryable =
            httpStatus == null ||
            httpStatus === 408 ||
            httpStatus === 429 ||
            httpStatus >= 500;
        const message = getApiErrorMessage(error, "云端同步失败");
        const failedNote = await markLocalNoteSyncFailed(
            database,
            ownerUserId,
            note.id,
            cloudState,
            message,
            note.current_revision_id ?? null,
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
        return { note: failedNote, cloudState, message, httpStatus, retryable };
    }
}

export async function saveNewNoteLocalFirst(
    database: ApplicationDatabase,
    ownerUserId: number,
    payload: CreateNotePayload,
    draft?: DraftCommit,
    onLocalSaved?: (note: Note) => void,
): Promise<NoteSaveResult> {
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
): Promise<NoteSaveResult> {
    const staged = await stageEditedNoteForSync(
        database,
        ownerUserId,
        note,
        payload,
        draft,
        onLocalSaved,
    );
    if (!staged.shouldUpload) {
        return {
            note: staged.note,
            cloudState: staged.cloudState ?? "accepted",
            unchanged: staged.unchanged,
            draftCleanupPending: staged.draftCleanupPending,
            message: staged.message,
        } satisfies NoteSaveResult;
    }

    return finishDraftSave(
        database,
        ownerUserId,
        staged.note,
        draft,
        staged.unchanged,
    );
}

/** 退出页面前只提交本地稳定版本；网络上传由页面退出后的协调器触发。 */
export async function stageEditedNoteForSync(
    database: ApplicationDatabase,
    ownerUserId: number,
    note: Note,
    payload: UpdateNotePayload,
    draft?: DraftCommit,
    onLocalSaved?: (note: Note) => void,
): Promise<StagedEditedNoteResult> {
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

    if (
        localNote.server_id != null &&
        localNote.last_sync_error?.startsWith("云端笔记已删除")
    ) {
        const retained = await markLocalNoteSyncFailed(
            database,
            ownerUserId,
            localNote.id,
            "rejected",
            localNote.last_sync_error,
        );
        if (!retained) throw new Error("无法读取已保留的本地笔记");
        publishNote(retained);
        return {
            note: retained,
            shouldUpload: false,
            cloudState: "rejected",
            unchanged: !revisionCreated,
            message: retained.last_sync_error ?? undefined,
            httpStatus: 404,
            retryable: false,
        };
    }
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
            shouldUpload: false,
            cloudState: "unknown",
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
            throw new Error(
                "[Note save] Unchanged note could not be reloaded.",
            );
        }
        publishNote(syncedNote);
        let draftCleanupPending = false;
        if (draft) {
            try {
                await deleteNoteDraft(database, ownerUserId, draft);
            } catch {
                draftCleanupPending = true;
                console.warn("[Note draft] 保存已完成，草稿清理未完成", {
                    clientId: syncedNote.id,
                });
            }
        }
        console.info("[Note save] 内容未变化，未创建新版本", {
            clientId: syncedNote.id,
        });
        return {
            note: syncedNote,
            shouldUpload: false,
            cloudState: "accepted",
            unchanged: true,
            draftCleanupPending,
        };
    }

    return {
        note: localNote,
        shouldUpload: true,
        unchanged: !revisionCreated,
    };
}

async function finishDraftSave(
    database: ApplicationDatabase,
    owner: number,
    note: Note,
    draft?: DraftCommit,
    unchanged = false,
): Promise<NoteSaveResult> {
    await enqueueNoteUpload(database, owner, note, draft);
    return {
        note,
        cloudState: "queued",
        unchanged,
        message: "已加入本地暂存队列，服务器可用时将自动同步",
    } satisfies NoteSaveResult;
}

/** 手动同步也先写入持久队列，由全局协调器探测服务器并串行上传。 */
export async function queueNoteUploadNow(
    database: ApplicationDatabase,
    owner: number,
    id: number,
) {
    const note = await getLocalNoteByClientId(database, owner, id);
    if (!note) throw new Error("笔记已不存在");
    if (note.server_id == null && note.sync_status === "unknown") {
        throw new Error(
            "此前创建请求结果未知，为避免重复笔记，暂不能再次上传。",
        );
    }
    await enqueueNoteUpload(database, owner, note);
    return {
        note,
        cloudState: "queued",
        message: "已加入本地暂存队列",
    } satisfies NoteSaveResult;
}

/** Explicit retry uses the current local snapshot and never replays an uncertain create. */
export async function uploadNoteNow(
    database: ApplicationDatabase,
    owner: number,
    id: number,
    onUploadProgress?: (event: AxiosProgressEvent) => void,
) {
    const note = await getLocalNoteByClientId(database, owner, id);
    if (!note) throw new Error("笔记已不存在");
    if (note.sync_status === "syncing")
        throw new Error("笔记正在同步，请稍后重试。");
    if (note.server_id == null && note.sync_status === "unknown") {
        throw new Error(
            "此前创建请求结果未知，为避免重复笔记，暂不能再次上传。",
        );
    }
    return syncPendingNote(database, owner, note, onUploadProgress);
}

/** 上传退出前已提交的本地版本；仅云端确认后条件清理对应草稿。 */
export async function uploadStagedNoteAfterExit(
    database: ApplicationDatabase,
    owner: number,
    id: number,
    draft: DraftCommit,
) {
    const result = await uploadNoteNow(database, owner, id);
    if (result.cloudState === "accepted") {
        try {
            await deleteNoteDraft(database, owner, draft);
        } catch {
            // 重新打开页面会接管草稿会话；旧上传不得删除新会话内容。
            console.info("[Note draft] 退出上传已完成，草稿已由新会话接管", {
                clientId: id,
            });
        }
    }
    return result;
}

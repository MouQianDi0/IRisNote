import type { ApplicationDatabase } from "@/core/database";
import {
    captureCloudStorageAccess,
    isCloudStoragePermissionError,
} from "@/core/cloud-storage/cloud-storage-policy";
import { isAxiosError } from "axios";
import { fetchCloudNote } from "../api/notes.api";
import {
    cloudNoteToLocal,
    noteSyncErrorMessage,
} from "../api/notes-sync.types";
import {
    evictNoteBodies,
    markNoteOpened,
    readNoteBodyStats,
} from "../data/note-body.repository";
import { fillLocalContentHashes } from "../data/note-content-hash";
import {
    getLocalNoteByClientId,
    getLocalNotes,
    reconcileNotesInTransaction,
} from "../data/note-local.repository";
import { setCachedNote } from "../notes.cache";
import { notifyNotesChanged } from "../notes.events";
import type { Note } from "../notes.types";
import { withNoteCacheMaintenance } from "./note-sync-coordinator";
import { heldNoteBodies } from "./note-sync.service";

export type NoteBodyFailure = "offline" | "not-found" | "local-only" | "error";

/** 正文不在本机且暂时取不到。`reason` 决定详情页显示哪种状态。 */
export class NoteBodyUnavailableError extends Error {
    constructor(
        readonly reason: NoteBodyFailure,
        message: string,
    ) {
        super(message);
        this.name = "NoteBodyUnavailableError";
    }
}

function publish(note: Note) {
    setCachedNote(note);
    notifyNotesChanged({ type: "upsert", note });
}

/**
 * 确保正文在本机：正文已在本机时只记录打开时间；已淘汰时按服务端 ID 下载，
 * 按云端数据合并（沿用同步合并逻辑，正文不同时生成版本），再记录打开时间并通知列表。
 */
export async function ensureNoteBody(
    db: ApplicationDatabase,
    owner: number,
    note: Note,
): Promise<Note> {
    if (note.body_state !== "evicted") {
        void markNoteOpened(db, owner, note.id).catch(() => {});
        return note;
    }
    const current = await getLocalNoteByClientId(db, owner, note.id);
    if (!current)
        throw new NoteBodyUnavailableError("not-found", "笔记已不存在");
    if (current.body_state !== "evicted") {
        await markNoteOpened(db, owner, current.id);
        publish(current);
        return current;
    }
    if (current.server_id == null)
        throw new NoteBodyUnavailableError("error", "笔记缺少云端副本");
    let checkAccess: () => void;
    try {
        checkAccess = captureCloudStorageAccess(owner);
    } catch (error) {
        throw new NoteBodyUnavailableError(
            "local-only",
            error instanceof Error ? error.message : "需要开启云存储",
        );
    }
    let cloud;
    try {
        cloud = await fetchCloudNote(owner, current.server_id);
        checkAccess();
    } catch (error) {
        if (isCloudStoragePermissionError(error))
            throw new NoteBodyUnavailableError("local-only", error.message);
        if (!isAxiosError(error)) throw error;
        const status = error.response?.status;
        if (status === undefined)
            throw new NoteBodyUnavailableError(
                "offline",
                "这篇笔记的正文不在本机，联网后可以查看",
            );
        const code = (
            error.response?.data as { error?: { code?: unknown } } | undefined
        )?.error?.code;
        if (status === 410 || (status === 404 && code === "NOTE_NOT_FOUND"))
            throw new NoteBodyUnavailableError(
                "not-found",
                "笔记可能已在云端删除",
            );
        throw new NoteBodyUnavailableError("error", noteSyncErrorMessage(error));
    }
    await db.transaction(async (tx) => {
        await reconcileNotesInTransaction(
            tx,
            owner,
            [cloudNoteToLocal(cloud)],
            undefined,
            undefined,
            true,
        );
        // A NULL cloud body writes nothing, so mark the empty body as present explicitly.
        if (cloud.content === null)
            await tx.run(
                `UPDATE local_notes SET body_state='present', content_preview=NULL, content_length=NULL
                 WHERE owner_user_id=? AND client_id=? AND body_state='evicted' AND content IS NULL`,
                [owner, current.id],
            );
    });
    const restored = await getLocalNoteByClientId(db, owner, current.id);
    if (!restored || restored.body_state === "evicted")
        throw new NoteBodyUnavailableError(
            "error",
            "正文暂时无法写入本机，请稍后重试",
        );
    await markNoteOpened(db, owner, restored.id);
    publish(restored);
    return restored;
}

/** 存储页“释放笔记正文”：释放所有可淘汰笔记的正文（不保留最近打开的），笔记仍在列表中。 */
export async function releaseNoteBodies(
    db: ApplicationDatabase,
    owner: number,
    check: () => void,
) {
    return withNoteCacheMaintenance(db, owner, async () => {
        check();
        await fillLocalContentHashes(db, owner, check);
        const released = await evictNoteBodies(
            db,
            owner,
            0,
            heldNoteBodies(),
            check,
        );
        if (released) {
            // Cards switch to the preview; cached copies must not keep serving the released body.
            for (const note of await getLocalNotes(db, owner))
                if (note.body_state === "evicted") publish(note);
        }
        return released;
    });
}

export function readNoteBodyUsage(db: ApplicationDatabase, owner: number) {
    return readNoteBodyStats(db, owner, heldNoteBodies());
}

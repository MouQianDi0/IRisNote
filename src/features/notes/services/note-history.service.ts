import type { ApplicationDatabase } from "@/core/database";
import { captureLocalStorageAccess } from "@/core/cloud-storage/cloud-storage-policy";
import { hasLocalCategories } from "../categories/data/category-local.repository";
import type { DraftCommit } from "../data/note-draft.repository";
import {
    getLocalNoteByClientId,
    restoreLocalNoteToRevision,
} from "../data/note-local.repository";
import {
    getNoteRevisionById,
    listNoteRevisionSummaries,
} from "../data/note-revision.repository";
import { setCachedNote } from "../notes.cache";
import { notifyNotesChanged } from "../notes.events";

/** 仅从本机读取。当前版本指针和列表在同一事务中获取，避免错标当前版本。 */
export async function readNoteHistory(
    database: ApplicationDatabase,
    owner: number,
    clientId: number,
) {
    const check = captureLocalStorageAccess(owner);
    return database.transaction(async (tx) => {
        check();
        const note = await getLocalNoteByClientId(tx, owner, clientId);
        if (!note) throw new Error("笔记已不存在，请返回列表");
        const revisions = await listNoteRevisionSummaries(tx, owner, clientId);
        const categories = (await hasLocalCategories(tx))
            ? await tx.getAll<{ id: number; name: string }>(
                  "SELECT id,name FROM local_categories WHERE owner_user_id=? AND deleted=0",
                  [owner],
              )
            : [];
        check();
        return { note, revisions, categories };
    });
}

export async function readHistoryRevision(
    database: ApplicationDatabase,
    owner: number,
    clientId: number,
    revisionId: string,
) {
    const check = captureLocalStorageAccess(owner);
    const revision = await getNoteRevisionById(database, owner, revisionId);
    check();
    if (!revision || revision.client_id !== clientId)
        throw new Error("历史版本已被清理或不属于这篇笔记，请刷新列表");
    if (revision.schema_version !== 1)
        throw new Error("此历史版本需要更新应用后才能查看和恢复");
    return revision;
}

/** 恢复走本地事务和已有持久上传队列，不等待网络，也不绕过云授权。 */
export async function restoreNoteFromHistory(
    database: ApplicationDatabase,
    owner: number,
    clientId: number,
    revisionId: string,
    expectedRevisionId: string | null,
    draft: DraftCommit,
) {
    const check = captureLocalStorageAccess(owner);
    const note = await restoreLocalNoteToRevision(
        database,
        owner,
        clientId,
        revisionId,
        { expectedRevisionId, draft, checkAccess: check },
    );
    // 提交后的订阅故障不能让 UI 误以为恢复回滚；切换账号后也不能再发布旧账号内容。
    try {
        check();
        setCachedNote(note);
        notifyNotesChanged({ type: "upsert", note });
    } catch {
        console.warn("[Note history] 本地恢复已提交，界面通知未完成");
    }
    return note;
}

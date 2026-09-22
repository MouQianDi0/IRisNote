import type { ApplicationDatabaseTransaction } from "@/core/database";

export type NoteRevisionOrigin =
    "local-save" | "server-reconcile" | "restore" | "migrate";

export type NoteRevision = {
    revision_id: string;
    owner_user_id: number;
    client_id: number;
    parent_revision_id: string | null;
    title: string;
    content: string | null;
    category_id: number | null;
    origin: NoteRevisionOrigin;
    created_at: string;
    schema_version: number;
};

/** 与编辑会话 ID 同风格的稳定版本 ID：时间 + 进程内计数 + 随机。 */
let revisionCounter = 0;
export const newRevisionId = () => {
    revisionCounter += 1;
    return `${Date.now().toString(36)}-${revisionCounter.toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
};

const REVISION_COLUMNS = `revision_id, owner_user_id, client_id, parent_revision_id,
    title, content, category_id, origin, created_at, schema_version`;

type InsertRevisionInput = {
    parentId: string | null;
    title: string;
    content: string | null;
    categoryId: number | null;
    origin: NoteRevisionOrigin;
};

/** 在调用方事务内插入一个新版本；不负责移动 local_notes 指针。 */
export async function insertNoteRevision(
    tx: ApplicationDatabaseTransaction,
    ownerUserId: number,
    clientId: number,
    input: InsertRevisionInput,
) {
    const revisionId = newRevisionId();
    await tx.run(
        `INSERT INTO note_revisions (
            revision_id, owner_user_id, client_id, parent_revision_id,
            title, content, category_id, origin, created_at, schema_version
         ) VALUES (
            $revisionId, $ownerUserId, $clientId, $parentId,
            $title, $content, $categoryId, $origin, $createdAt, 1
         )`,
        {
            $revisionId: revisionId,
            $ownerUserId: ownerUserId,
            $clientId: clientId,
            $parentId: input.parentId,
            $title: input.title,
            $content: input.content,
            $categoryId: input.categoryId,
            $origin: input.origin,
            $createdAt: new Date().toISOString(),
        },
    );
    return revisionId;
}

/** 读取笔记当前指向的版本；未迁移或无版本时返回 null。 */
export async function getCurrentNoteRevision(
    tx: ApplicationDatabaseTransaction,
    ownerUserId: number,
    clientId: number,
) {
    const pointer = await tx.getFirst<{ current_revision_id: string | null }>(
        `SELECT current_revision_id FROM local_notes
         WHERE owner_user_id = $ownerUserId AND client_id = $clientId`,
        { $ownerUserId: ownerUserId, $clientId: clientId },
    );
    if (!pointer?.current_revision_id) return null;
    const row = await tx.getFirst<NoteRevision>(
        `SELECT ${REVISION_COLUMNS}
         FROM note_revisions
         WHERE owner_user_id = $ownerUserId AND revision_id = $revisionId`,
        { $ownerUserId: ownerUserId, $revisionId: pointer.current_revision_id },
    );
    return row ?? null;
}

export async function getNoteRevisionById(
    tx: ApplicationDatabaseTransaction,
    ownerUserId: number,
    revisionId: string,
) {
    const row = await tx.getFirst<NoteRevision>(
        `SELECT ${REVISION_COLUMNS}
         FROM note_revisions
         WHERE owner_user_id = $ownerUserId AND revision_id = $revisionId`,
        { $ownerUserId: ownerUserId, $revisionId: revisionId },
    );
    return row ?? null;
}

export async function listNoteRevisions(
    db: ApplicationDatabaseTransaction,
    ownerUserId: number,
    clientId: number,
) {
    return db.getAll<NoteRevision>(
        `SELECT ${REVISION_COLUMNS}
         FROM note_revisions
         WHERE owner_user_id = $ownerUserId AND client_id = $clientId
         ORDER BY created_at DESC, revision_id DESC`,
        { $ownerUserId: ownerUserId, $clientId: clientId },
    );
}

export async function deleteNoteRevisions(
    tx: ApplicationDatabaseTransaction,
    ownerUserId: number,
    clientId: number,
) {
    await tx.run(
        `DELETE FROM note_revisions
         WHERE owner_user_id = $ownerUserId AND client_id = $clientId`,
        { $ownerUserId: ownerUserId, $clientId: clientId },
    );
}

/** 无变化判断：与当前版本比较裁剪后的标题、正文和分类。 */
export function revisionContentEquals(
    value: { title: string; content: string | null; categoryId: number | null },
    revision: NoteRevision,
) {
    return (
        value.title.trim() === revision.title &&
        (value.content ?? "").trim() === (revision.content ?? "") &&
        (value.categoryId ?? null) === (revision.category_id ?? null)
    );
}

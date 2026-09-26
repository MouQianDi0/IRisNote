import type {
    ApplicationDatabase,
    ApplicationDatabaseTransaction,
} from "@/core/database";
import type { Note } from "../notes.types";
import { isRemovedLocalNote } from "./note-trash.repository";

export type NoteDraftValue = {
    title: string;
    content: string;
    categoryId: number | null;
};
export type NoteDraft = {
    owner_user_id: number;
    draft_key: string;
    session_id: string;
    note_id: number | null;
    base_snapshot: string;
    /** 草稿开始时的基础版本；迁移前的旧草稿可能为 NULL，退回快照比对。 */
    base_revision_id: string | null;
    title: string;
    content: string;
    category_id: number | null;
    sequence: number;
    updated_at: string;
};
export type DraftCommit = {
    key: string;
    sessionId: string;
    sequence: number;
    removeExplicitFile?: boolean;
    beforeDelete?: () => Promise<void>;
};

export const noteDraftValue = (note: Note): NoteDraftValue => ({
    title: note.title,
    content: note.content ?? "",
    categoryId: note.category_id,
});
export const draftValue = (draft: NoteDraft): NoteDraftValue => ({
    title: draft.title,
    content: draft.content,
    categoryId: draft.category_id,
});
/** 暂时使用完整基础快照检测本地变化，不冒充服务端 Revision。 */
export const draftSnapshot = (value: NoteDraftValue) =>
    JSON.stringify([value.title, value.content, value.categoryId]);

export function readNoteDraft(
    db: ApplicationDatabaseTransaction,
    owner: number,
    key: string,
) {
    return db.getFirst<NoteDraft>(
        "SELECT * FROM note_drafts WHERE owner_user_id = ? AND draft_key = ?",
        [owner, key],
    );
}

/** 新会话取得写入权；旧会话后续写入被条件更新拒绝。 */
export async function openNoteDraft(
    db: ApplicationDatabase,
    owner: number,
    key: string,
    sessionId: string,
    noteId: number | null,
    initial: NoteDraftValue,
    baseRevisionId: string | null = null,
) {
    return db.transaction(async (tx) => {
        if (noteId !== null && (await isRemovedLocalNote(tx, owner, noteId)))
            throw new Error("笔记已移入垃圾桶，请先恢复");
        await tx.run(
            `INSERT INTO note_drafts
            (owner_user_id, draft_key, session_id, note_id, base_snapshot, base_revision_id, title, content, category_id, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT (owner_user_id, draft_key) DO UPDATE SET
                session_id = excluded.session_id,
                base_snapshot = CASE WHEN note_drafts.sequence = 0 THEN excluded.base_snapshot ELSE note_drafts.base_snapshot END,
                base_revision_id = CASE WHEN note_drafts.sequence = 0 THEN excluded.base_revision_id ELSE note_drafts.base_revision_id END,
                title = CASE WHEN note_drafts.sequence = 0 THEN excluded.title ELSE note_drafts.title END,
                content = CASE WHEN note_drafts.sequence = 0 THEN excluded.content ELSE note_drafts.content END,
                category_id = CASE WHEN note_drafts.sequence = 0 THEN excluded.category_id ELSE note_drafts.category_id END`,
            [
                owner,
                key,
                sessionId,
                noteId,
                draftSnapshot(initial),
                baseRevisionId,
                initial.title,
                initial.content,
                initial.categoryId,
                new Date().toISOString(),
            ],
        );
        const row = await readNoteDraft(tx, owner, key);
        if (!row) throw new Error("无法读取本地草稿");
        return row;
    });
}

export async function writeNoteDraft(
    db: ApplicationDatabase,
    owner: number,
    commit: DraftCommit,
    value: NoteDraftValue,
) {
    const startedAt = Date.now();
    const metadata = {
        database: "irisnote.db",
        table: "note_drafts",
        ownerUserId: owner,
        draftKey: commit.key,
        sessionId: commit.sessionId,
        sequence: commit.sequence,
    };
    // 不记录标题、正文、SQL 参数或异常原文；日志异常不能影响存档结果。
    const log = (
        event: "write_start" | "write_success" | "write_failure",
        reason?: string,
    ) => {
        try {
            const record = {
                ...metadata,
                event,
                timestamp: new Date().toISOString(),
                durationMs: Date.now() - startedAt,
                ...(reason ? { reason } : {}),
            };
            if (event === "write_failure") console.warn("[Note draft]", record);
            else console.info("[Note draft]", record);
        } catch {
            /* 调试输出不可阻止数据库操作。 */
        }
    };
    log("write_start");
    let reason = "database_write_failed";
    try {
        const result = await db.run(
            `UPDATE note_drafts SET title = ?, content = ?, category_id = ?, sequence = ?, updated_at = ?
             WHERE owner_user_id = ? AND draft_key = ? AND session_id = ? AND sequence < ?`,
            [
                value.title,
                value.content,
                value.categoryId,
                commit.sequence,
                new Date().toISOString(),
                owner,
                commit.key,
                commit.sessionId,
                commit.sequence,
            ],
        );
        if (result.changes !== 1) {
            reason = "session_or_sequence_mismatch";
            throw new Error(
                "草稿会话已变化，当前输入尚未落盘。请先复制保留，再重新打开笔记",
            );
        }
        log("write_success");
    } catch (error) {
        log("write_failure", reason);
        throw error;
    }
}

/** 用户在合并编辑页确认采用冲突草稿后，将当前已保存版本设为新的提交基础。 */
export async function rebaseNoteDraft(
    db: ApplicationDatabase,
    owner: number,
    commit: DraftCommit,
    current: Note,
) {
    const result = await db.run(
        `UPDATE note_drafts SET base_snapshot = ?, base_revision_id = ?, updated_at = ?
         WHERE owner_user_id = ? AND draft_key = ? AND session_id = ? AND sequence = ?`,
        [
            draftSnapshot(noteDraftValue(current)),
            current.current_revision_id ?? null,
            new Date().toISOString(),
            owner,
            commit.key,
            commit.sessionId,
            commit.sequence,
        ],
    );
    if (result.changes !== 1) {
        throw new Error("草稿已变化，未确认覆盖，请重新打开后检查");
    }
}

export async function deleteNoteDraft(
    db: ApplicationDatabase,
    owner: number,
    commit: DraftCommit,
) {
    if (commit.beforeDelete) {
        return db.transaction(async (tx) => {
            const row = await readNoteDraft(tx, owner, commit.key);
            if (
                !row ||
                row.session_id !== commit.sessionId ||
                row.sequence !== commit.sequence
            ) {
                throw new Error("草稿已变化，未删除任何内容，请重新打开后检查");
            }
            await commit.beforeDelete!();
            await tx.run(
                "DELETE FROM note_drafts WHERE owner_user_id = ? AND draft_key = ? AND session_id = ? AND sequence = ?",
                [owner, commit.key, commit.sessionId, commit.sequence],
            );
        });
    }
    const result = await db.run(
        "DELETE FROM note_drafts WHERE owner_user_id = ? AND draft_key = ? AND session_id = ? AND sequence = ?",
        [owner, commit.key, commit.sessionId, commit.sequence],
    );
    if (result.changes !== 1)
        throw new Error("草稿已变化，未删除任何内容，请重新打开后检查");
}

/** 在笔记提交事务内检查草稿身份、序号和基础内容。 */
export async function assertDraftCommit(
    tx: ApplicationDatabaseTransaction,
    owner: number,
    commit: DraftCommit | undefined,
    current: Note | null,
) {
    if (!commit) return;
    const row = await readNoteDraft(tx, owner, commit.key);
    if (
        !row ||
        row.session_id !== commit.sessionId ||
        row.sequence !== commit.sequence
    ) {
        throw new Error("草稿已被其他编辑会话修改，本次保存已停止");
    }
    if (row.note_id !== null && row.note_id !== current?.id) {
        throw new Error("已保存内容发生变化，草稿已保留，请重新打开并核对");
    }
    if (row.note_id === null) return;
    // 基础版本优先：指针前移说明已保存内容被其他写入更新过。
    if (row.base_revision_id !== null) {
        if (row.base_revision_id !== (current?.current_revision_id ?? null)) {
            throw new Error("已保存内容发生变化，草稿已保留，请重新打开并核对");
        }
        return;
    }
    // 迁移前旧草稿没有基础版本，退回完整内容快照比对。
    if (
        current &&
        row.base_snapshot !== draftSnapshot(noteDraftValue(current))
    ) {
        throw new Error("已保存内容发生变化，草稿已保留，请重新打开并核对");
    }
}

export async function linkCommittedDraft(
    tx: ApplicationDatabaseTransaction,
    owner: number,
    commit: DraftCommit | undefined,
    note: Note,
) {
    if (!commit) return;
    await tx.run(
        `UPDATE note_drafts SET note_id = ?, base_snapshot = ?, base_revision_id = ?
         WHERE owner_user_id = ? AND draft_key = ? AND session_id = ? AND sequence = ?`,
        [
            note.id,
            draftSnapshot(noteDraftValue(note)),
            note.current_revision_id ?? null,
            owner,
            commit.key,
            commit.sessionId,
            commit.sequence,
        ],
    );
}

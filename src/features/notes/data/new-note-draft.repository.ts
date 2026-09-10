import type { ApplicationDatabase } from "@/core/database";
import { draftValue, openNoteDraft, readNoteDraft, type DraftCommit, type NoteDraft, type NoteDraftValue } from "./note-draft.repository";
import { savedDraftFiles } from "./saved-draft-files";

export type DraftEntry = { key: string; row: NoteDraft; kind: "saved" | "recovery" };
export const hasDraftContent = (value: NoteDraftValue) => Boolean(value.title.trim() || value.content.trim());
export const newDraftKey = () => "new:" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2) + "-" + Math.random().toString(36).slice(2);
export const isNewDraftKey = (key: string) => key === "new" || /^new:[a-z0-9-]+$/.test(key);

function parseSaved(text: string, owner: number, key: string): NoteDraft {
    const row: NoteDraft = JSON.parse(text);
    if (row.owner_user_id !== owner || row.draft_key !== key || !isNewDraftKey(key) ||
        typeof row.title !== "string" || typeof row.content !== "string" || typeof row.session_id !== "string" ||
        !Number.isSafeInteger(row.sequence) || row.sequence < 0 || !Number.isFinite(Date.parse(row.updated_at)) ||
        !(row.note_id === null || Number.isSafeInteger(row.note_id)) ||
        !(row.category_id === null || Number.isSafeInteger(row.category_id)) ||
        !(row.base_revision_id === null || typeof row.base_revision_id === "string") || typeof row.base_snapshot !== "string") {
        throw new Error("草稿文件格式不正确，原文件已保留");
    }
    return row;
}

export async function listNewNoteDrafts(db: ApplicationDatabase, owner: number): Promise<DraftEntry[]> {
    const entries = new Map<string, DraftEntry>();
    const recovery = await db.getAll<NoteDraft>(
        "SELECT * FROM note_drafts WHERE owner_user_id = ? AND (draft_key = 'new' OR draft_key LIKE 'new:%')", [owner]);
    for (const row of recovery) {
        if (row.sequence > 0 && hasDraftContent(draftValue(row))) entries.set(row.draft_key, { key: row.draft_key, row, kind: "recovery" });
    }
    for (const key of await savedDraftFiles.keys(owner)) {
        if (!isNewDraftKey(key)) continue;
        // 同一草稿的恢复记录更新、更可靠；文件写入中断不能挡住恢复入口。
        if (entries.has(key)) continue;
        const text = await savedDraftFiles.read(owner, key);
        if (text === null) continue;
        const row = parseSaved(text, owner, key);
        if (hasDraftContent(draftValue(row))) entries.set(key, { key, row, kind: "saved" });
    }
    return [...entries.values()].sort((a, b) => b.row.updated_at.localeCompare(a.row.updated_at));
}

/** 读取时不抢占会话；只有明确继续编辑才取得写入权。 */
export async function resumeNewNoteDraft(db: ApplicationDatabase, owner: number, key: string, sessionId: string) {
    if (!isNewDraftKey(key)) throw new Error("草稿标识无效");
    const recovery = await readNoteDraft(db, owner, key);
    if (recovery) return openNoteDraft(db, owner, key, sessionId, recovery.note_id, draftValue(recovery), recovery.base_revision_id);
    const text = await savedDraftFiles.read(owner, key);
    if (text === null) throw new Error("草稿已不存在，请重新打开草稿列表");
    const saved = parseSaved(text, owner, key);
    return db.transaction(async (tx) => {
        // 其他窗口可能在文件读取期间已恢复，不能覆盖其输入。
        if (await readNoteDraft(tx, owner, key)) throw new Error("草稿会话已变化，请重试");
        await tx.run(`INSERT INTO note_drafts
            (owner_user_id, draft_key, session_id, note_id, base_snapshot, base_revision_id, title, content, category_id, sequence, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [owner, key, sessionId, saved.note_id, saved.base_snapshot, saved.base_revision_id,
                saved.title, saved.content, saved.category_id, Math.max(1, saved.sequence), saved.updated_at]);
        return (await readNoteDraft(tx, owner, key))!;
    });
}

export async function saveExplicitDraft(db: ApplicationDatabase, owner: number, commit: DraftCommit) {
    await db.transaction(async (tx) => {
        const row = await readNoteDraft(tx, owner, commit.key);
        if (!row || row.session_id !== commit.sessionId || row.sequence !== commit.sequence) throw new Error("草稿会话已变化，内容已保留");
        await savedDraftFiles.write(owner, commit.key, JSON.stringify(row));
        await tx.run("DELETE FROM note_drafts WHERE owner_user_id = ? AND draft_key = ? AND session_id = ? AND sequence = ?",
            [owner, commit.key, commit.sessionId, commit.sequence]);
    });
}

/** 在删除关联恢复记录之前清理文件；文件清理失败仍可借助关联记录避免重复创建笔记。 */
export async function removeExplicitDraft(owner: number, key: string) {
    if (!isNewDraftKey(key)) throw new Error("草稿标识无效");
    await savedDraftFiles.remove(owner, key);
}

export type DraftDeleteResult = { deleted: string[]; failed: { key: string; message: string }[] };

const sameDraft = (a: NoteDraft, b: NoteDraft) =>
    (Object.keys(b) as (keyof NoteDraft)[]).every((field) => a[field] === b[field]);

/** 草稿箱永久删除：先确保有持久恢复副本，再清文件，最后删除数据库记录。 */
export async function deleteNewNoteDrafts(db: ApplicationDatabase, owner: number, entries: readonly DraftEntry[]): Promise<DraftDeleteResult> {
    if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error("草稿账户无效");
    const result: DraftDeleteResult = { deleted: [], failed: [] };
    for (const entry of new Map(entries.map((item) => [item.key, item])).values()) {
        try {
            if (!isNewDraftKey(entry.key) || entry.row.owner_user_id !== owner || entry.row.draft_key !== entry.key) {
                throw new Error("草稿身份不匹配");
            }
            const conflict = () => new Error("草稿已变化，请核对刷新后的内容再删除");
            await db.transaction(async (tx) => {
                const recovery = await readNoteDraft(tx, owner, entry.key);
                if (entry.kind === "recovery") {
                    if (!recovery || !sameDraft(recovery, entry.row)) throw conflict();
                    return;
                }
                if (recovery) throw conflict();
                const text = await savedDraftFiles.read(owner, entry.key);
                if (text === null || !sameDraft(parseSaved(text, owner, entry.key), entry.row)) throw conflict();
                const row = entry.row;
                // 独立提交副本：文件删除后即便下一事务提交失败，也仍能恢复内容。
                await tx.run(`INSERT INTO note_drafts
                    (owner_user_id, draft_key, session_id, note_id, base_snapshot, base_revision_id, title, content, category_id, sequence, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [owner, entry.key, row.session_id, row.note_id, row.base_snapshot, row.base_revision_id,
                        row.title, row.content, row.category_id, row.sequence, row.updated_at]);
            });
            await db.transaction(async (tx) => {
                const row = await readNoteDraft(tx, owner, entry.key);
                if (!row || !sameDraft(row, entry.row)) throw conflict();
                await savedDraftFiles.remove(owner, entry.key);
                const removed = await tx.run("DELETE FROM note_drafts WHERE owner_user_id = ? AND draft_key = ? AND session_id = ? AND sequence = ?",
                    [owner, entry.key, row.session_id, row.sequence]);
                if (removed.changes !== 1) throw conflict();
            });
            result.deleted.push(entry.key);
        } catch (cause) {
            result.failed.push({ key: entry.key, message: cause instanceof Error ? cause.message : "删除失败，请重试" });
        }
    }
    return result;
}

export async function discardNewRecovery(db: ApplicationDatabase, owner: number, commit: DraftCommit) {
    await db.transaction(async (tx) => {
        const row = await readNoteDraft(tx, owner, commit.key);
        if (!row || row.session_id !== commit.sessionId || row.sequence !== commit.sequence) throw new Error("草稿会话已变化，未删除任何内容");
        // 正式保存已落地但云端未确认时，保留主动草稿原文，同时沿用目标笔记身份。
        // 否则删除恢复副本后，再打开原草稿会错误地创建第二篇笔记。
        if (row.note_id !== null) {
            const text = await savedDraftFiles.read(owner, commit.key);
            if (text !== null) {
                const saved = parseSaved(text, owner, commit.key);
                await savedDraftFiles.write(owner, commit.key, JSON.stringify({ ...saved, note_id: row.note_id,
                    base_snapshot: row.base_snapshot, base_revision_id: row.base_revision_id }));
            }
        }
        await tx.run("DELETE FROM note_drafts WHERE owner_user_id = ? AND draft_key = ? AND session_id = ? AND sequence = ?",
            [owner, commit.key, commit.sessionId, commit.sequence]);
    });
}

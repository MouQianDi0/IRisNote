import type { ApplicationDatabase } from "@/core/database";
import { assertDraftCommit, draftValue, openNoteDraft, readNoteDraft, writeNoteDraft, type NoteDraft, type NoteDraftValue } from "../data/note-draft.repository";
import { getLocalNoteByClientId } from "../data/note-local.repository";
import { discardNewRecovery, newDraftKey, removeExplicitDraft, resumeNewNoteDraft, saveExplicitDraft } from "../data/new-note-draft.repository";
import { NoteDraftSession, type DraftWriteState } from "./note-draft-session";

/** 新建笔记独立生命周期。序列锁保证删除后卸载补写不会复活内容。 */
export class NewNoteDraftSession {
    readonly key: string;
    readonly sessionId: string;
    readonly session: NoteDraftSession;
    readonly ready: Promise<NoteDraft>;
    private done = false;

    constructor(private db: ApplicationDatabase, readonly owner: number, initial: NoteDraftValue,
        notify: (state: DraftWriteState, error?: unknown) => void, row?: NoteDraft) {
        this.key = row?.draft_key ?? newDraftKey();
        this.sessionId = row?.session_id ?? newDraftKey();
        this.ready = row ? Promise.resolve(row) : openNoteDraft(db, owner, this.key, this.sessionId, null, initial);
        // 显示初始化错误由调用方负责，避免首次输入之前产生未处理拒绝。
        void this.ready.catch(() => undefined);
        this.session = new NoteDraftSession(row ? draftValue(row) : initial, row?.sequence ?? 0,
            async (value, sequence) => {
                await this.ready;
                await writeNoteDraft(db, owner, { key: this.key, sessionId: this.sessionId, sequence }, value);
            }, notify);
    }

    static async resume(db: ApplicationDatabase, owner: number, key: string,
        notify: (state: DraftWriteState, error?: unknown) => void) {
        const row = await resumeNewNoteDraft(db, owner, key, newDraftKey());
        return new NewNoteDraftSession(db, owner, draftValue(row), notify, row);
    }

    get value() { return this.session.value; }
    change(value: NoteDraftValue) { if (!this.done) this.session.change(value); }
    async flush() { if (!this.done) { await this.ready; await this.session.flush(); } }
    unlock() { this.session.endSave(); }

    private async lock() {
        const snapshot = await this.session.beginSave();
        await this.ready;
        return { ...snapshot, commit: { key: this.key, sessionId: this.sessionId, sequence: snapshot.sequence } };
    }

    async beginSave() {
        try {
            const snapshot = await this.lock();
            const row = await readNoteDraft(this.db, this.owner, this.key);
            const target = row?.note_id == null ? undefined : await getLocalNoteByClientId(this.db, this.owner, row.note_id) ?? undefined;
            await assertDraftCommit(this.db, this.owner, snapshot.commit, target ?? null);
            return { ...snapshot, target, commit: { ...snapshot.commit,
                beforeDelete: () => removeExplicitDraft(this.owner, this.key) } };
        } catch (cause) { this.unlock(); throw cause; }
    }

    async saveDraft() {
        try {
            const snapshot = await this.lock();
            await saveExplicitDraft(this.db, this.owner, snapshot.commit);
            this.done = true;
        } catch (cause) { this.unlock(); throw cause; }
    }

    async discard() {
        try {
            const sequence = await this.session.suspendForDiscard();
            await this.ready;
            await discardNewRecovery(this.db, this.owner, { key: this.key, sessionId: this.sessionId, sequence });
            this.session.abandon();
            this.done = true;
        } catch (cause) { this.unlock(); throw cause; }
    }

    finish() { this.done = true; }
    async close() {
        // 已经持久化、锁定的会话没有待补写内容。
        await this.session.close();
    }
}

import type { NoteDraftValue } from "../data/note-draft.repository";

export const DRAFT_TIMING = { debounceMs: 750, maxWaitMs: 5000, retryMs: 3000 } as const;
export type DraftWriteState = "idle" | "pending" | "writing" | "saved" | "error";

/** 独立于 React 的串行调度器。队列中只补写最新快照，不积压每次按键。 */
export class NoteDraftSession {
    value: NoteDraftValue;
    sequence: number;
    persistedSequence: number;
    private trailing?: ReturnType<typeof setTimeout>;
    private deadline?: ReturnType<typeof setTimeout>;
    private retry?: ReturnType<typeof setTimeout>;
    private writing?: Promise<void>;
    private closed = false;
    private locked = false;

    constructor(
        initial: NoteDraftValue,
        sequence: number,
        private readonly persist: (value: NoteDraftValue, sequence: number) => Promise<void>,
        private readonly notify: (state: DraftWriteState, error?: unknown) => void,
    ) {
        this.value = initial;
        this.sequence = sequence;
        this.persistedSequence = sequence;
    }

    get dirty() { return this.sequence > this.persistedSequence; }

    change(value: NoteDraftValue) {
        if (this.closed || this.locked) return;
        if (value.title === this.value.title && value.content === this.value.content &&
            value.categoryId === this.value.categoryId) return;
        this.value = { ...value };
        this.sequence++;
        this.notify("pending");
        clearTimeout(this.trailing);
        this.trailing = setTimeout(() => this.backgroundFlush(), DRAFT_TIMING.debounceMs);
        this.deadline ??= setTimeout(() => this.backgroundFlush(), DRAFT_TIMING.maxWaitMs);
    }

    private clearTimers() {
        clearTimeout(this.trailing);
        clearTimeout(this.deadline);
        clearTimeout(this.retry);
        this.trailing = this.deadline = this.retry = undefined;
    }

    private backgroundFlush() { void this.flush().catch(() => undefined); }

    flush(): Promise<void> {
        this.clearTimers();
        if (this.writing) return this.writing;
        if (!this.dirty) return Promise.resolve();
        this.writing = this.drain().finally(() => { this.writing = undefined; });
        return this.writing;
    }

    private async drain() {
        try {
            while (this.dirty) {
                const sequence = this.sequence;
                const value = { ...this.value };
                this.notify("writing");
                await this.persist(value, sequence);
                this.persistedSequence = sequence;
            }
            this.clearTimers();
            this.notify("saved");
        } catch (error) {
            this.notify("error", error);
            // 卸载后不保留定时器；下次打开从已落盘数据恢复。
            if (!this.closed) this.retry = setTimeout(() => this.backgroundFlush(), DRAFT_TIMING.retryMs);
            throw error;
        }
    }

    async beginSave() {
        if (this.closed || this.locked) throw new Error("当前编辑会话正在处理，请稍后再试");
        this.locked = true;
        try { await this.flush(); } catch (error) { this.locked = false; throw error; }
        return { value: { ...this.value }, sequence: this.sequence };
    }

    endSave() { this.locked = false; }

    /** 放弃内容时不强迫写入最后一次输入，但必须等在途写入结束再删除。 */
    async suspendForDiscard() {
        if (this.closed || this.locked) throw new Error("当前编辑会话正在处理，请稍后再试");
        this.locked = true;
        this.clearTimers();
        await this.writing?.catch(() => undefined);
        this.clearTimers();
        return this.persistedSequence;
    }

    abandon() {
        this.closed = true;
        this.locked = true;
        this.clearTimers();
        this.persistedSequence = this.sequence;
    }

    async close() {
        this.closed = true;
        this.clearTimers();
        await this.flush();
    }
}

import {
    ReadingText,
    type ReadingGeometry,
    type ReadingHistory,
    type ReadingPosition,
} from "./reading-position";

export type ReadingSessionIO = {
    read: () => Promise<ReadingHistory | null>;
    save: (position: ReadingPosition) => Promise<unknown>;
    restore: (offset: number) => void;
    position: (position: ReadingPosition) => void;
    failed: (operation: "read" | "save") => void;
    saved: () => void;
};
/** Each mounted note/content revision owns one session. No mutable state crosses accounts. */
export class ReadingSession {
    readonly text: ReadingText;
    private epoch = 0;
    private active = false;
    private loaded = false;
    private interacted = false;
    private initialized = false;
    private history: ReadingHistory | null = null;
    private geometry: ReadingGeometry | null = null;
    private latest: ReadingPosition | null = null;
    private offset = 0;
    private dirty = 0;
    private committed = 0;
    private writing: Promise<void> | null = null;
    constructor(
        content: string | null,
        private io: ReadingSessionIO,
    ) {
        this.text = new ReadingText(content);
    }
    isActive() {
        return this.active;
    }
    async start() {
        this.active = true;
        this.loaded = false;
        this.initialized = false;
        const epoch = ++this.epoch;
        try {
            const history = await this.io.read();
            if (!this.active || epoch !== this.epoch) return;
            this.history = history;
            this.loaded = true;
            this.io.saved();
            this.initialize();
        } catch {
            if (this.active && epoch === this.epoch) this.io.failed("read");
        }
    }
    stop() {
        if (!this.active) return;
        if (this.writing && this.latest && this.dirty > this.committed) {
            // Enqueue the final snapshot now, before a new note/content session can start.
            void this.io.save(this.latest).catch(() => {});
        } else void this.flush();
        this.active = false;
        this.epoch++;
    }
    private initialize() {
        if (!this.loaded || !this.geometry || !this.active || this.initialized)
            return;
        this.initialized = true;
        if (!this.interacted && this.history) {
            this.offset = this.text.restore(this.history, this.geometry);
            this.io.restore(this.offset);
        }
        this.latest = this.text.atOffset(this.offset, this.geometry);
        this.io.position(this.latest);
        // Upgrade legacy records only after real layout; never write an initial 0 over history.
        if (!this.history || !("line" in this.history) || this.interacted)
            this.dirty++;
    }
    setGeometry(geometry: ReadingGeometry) {
        if (
            geometry.viewport <= 0 ||
            geometry.bodyHeight <= 0 ||
            geometry.contentHeight <= 0 ||
            !geometry.rows.length
        )
            return;
        const prior = this.latest;
        const beforeBody = this.geometry && this.offset < this.geometry.bodyTop;
        const changed =
            this.geometry &&
            (this.geometry.bodyTop !== geometry.bodyTop ||
                this.geometry.bodyHeight !== geometry.bodyHeight ||
                this.geometry.viewport !== geometry.viewport ||
                this.geometry.contentHeight !== geometry.contentHeight ||
                this.geometry.rows !== geometry.rows);
        this.geometry = geometry;
        if (
            this.initialized &&
            this.active &&
            changed &&
            prior &&
            !beforeBody
        ) {
            this.offset = this.text.restore(prior, geometry);
            this.io.restore(this.offset);
            // Preserve the character anchor even when the new visual row starts earlier.
            this.latest = prior;
        }
        this.initialize();
    }
    interact() {
        if (this.active) this.interacted = true;
    }
    sample(offset: number) {
        if (!this.active || !Number.isFinite(offset)) return;
        // Programmatic restore and layout scroll events are not user reading changes.
        if (!this.interacted) return;
        if (this.initialized && offset === this.offset) return;
        this.offset = offset;
        if (!this.geometry || !this.initialized) return;
        const next = this.text.atOffset(offset, this.geometry);
        if (
            this.latest &&
            next.line === this.latest.line &&
            next.character === this.latest.character &&
            Math.abs(next.percent - this.latest.percent) < 0.001
        )
            return;
        this.latest = next;
        this.dirty++;
        this.io.position(next);
    }
    jump(line: number, character = 0) {
        if (!this.active || !this.geometry) return;
        const index = this.text.index(line, character);
        if (index === null) return;
        this.interact();
        const target = this.text.position(index, 0);
        this.offset = this.text.restore(target, this.geometry);
        this.io.restore(this.offset);
        this.latest = {
            ...target,
            percent: this.text.atOffset(this.offset, this.geometry).percent,
        };
        this.io.position(this.latest);
        this.dirty++;
        void this.flush();
    }
    async retry() {
        if (!this.active) return;
        if (!this.loaded) await this.start();
        await this.flush();
    }
    flush(): Promise<void> {
        if (this.writing) return this.writing;
        if (
            !this.loaded ||
            !this.initialized ||
            !this.latest ||
            this.dirty <= this.committed
        )
            return Promise.resolve();
        const epoch = this.epoch;
        this.writing = (async () => {
            // Coalesce updates arriving during a slow write; a failure retains the newest snapshot.
            while (this.latest && this.dirty > this.committed) {
                const version = this.dirty;
                const position = this.latest;
                try {
                    await this.io.save(position);
                    this.committed = version;
                    if (this.active && epoch === this.epoch) this.io.saved();
                } catch {
                    if (this.active && epoch === this.epoch)
                        this.io.failed("save");
                    break;
                }
                if (!this.active || epoch !== this.epoch) break;
            }
        })().finally(() => {
            this.writing = null;
        });
        return this.writing;
    }
}

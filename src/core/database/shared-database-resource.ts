type Closeable = { close: () => Promise<void> };

type ResourceEntry<T extends Closeable> = {
    ready: Promise<T>;
    value?: T;
    references: number;
    previousClosing: Promise<void>;
};

/** 多个 Provider 共用初始化；最后一个租约释放后等待初始化、任务排空和关闭。 */
export class SharedDatabaseResource<T extends Closeable> {
    private current: ResourceEntry<T> | null = null;
    private closing: Promise<void> = Promise.resolve();

    constructor(private readonly open: () => Promise<T>) {}

    acquire() {
        if (!this.current) {
            const entry: ResourceEntry<T> = {
                references: 0,
                previousClosing: this.closing,
                // 快速卸载/重挂载时，新打开操作必须等待旧连接关闭。
                ready: this.closing.then(() => this.open()),
            };
            entry.ready = entry.ready.then((value) => {
                entry.value = value;
                return value;
            });
            this.current = entry;
        }
        const entry = this.current;
        entry.references += 1;
        let released: Promise<void> | null = null;
        const lease = {
            active: true,
            ready: entry.ready,
            release: (): Promise<void> => {
                if (released) return released;
                lease.active = false;
                entry.references -= 1;
                if (entry.references > 0) {
                    released = Promise.resolve();
                    return released;
                }
                this.current = null;
                released = entry.value
                    ? entry.value.close()
                    : entry.ready.then(
                        (value) => value.close(),
                        // 初始化本身失败可以重试；前一连接关闭失败则保留阻断。
                        () => entry.previousClosing,
                    );
                this.closing = released;
                // 调用方仍收到关闭错误，后续 acquire 也会失败，不复用不确定连接。
                void released.catch(() => undefined);
                return released;
            },
        };
        return lease;
    }
}

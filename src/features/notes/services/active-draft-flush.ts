type DraftFlush = () => Promise<void>;

const active = new Set<DraftFlush>();
const retiring = new Set<Promise<void>>();
const failed = new Set<DraftFlush>();

/** Keep unmount writes in the barrier until they settle as well. */
export function registerActiveDraftFlush(flush: DraftFlush): () => void {
    active.add(flush);
    return () => {
        if (!active.delete(flush)) return;
        const pending = Promise.resolve().then(flush);
        retiring.add(pending);
        void pending.then(
            () => {
                retiring.delete(pending);
                failed.delete(flush);
            },
            () => {
                retiring.delete(pending);
                failed.add(flush);
            },
        );
    };
}

export async function flushActiveDrafts(): Promise<void> {
    // Retain failed unmount flushes so retry must actually save, not just dismiss an error.
    const callbacks = new Set([...active, ...failed]);
    await Promise.all(
        [...callbacks]
            .map(async (flush) => {
                try {
                    await flush();
                    failed.delete(flush);
                } catch (error) {
                    failed.add(flush);
                    throw error;
                }
            })
            .concat([...retiring]),
    );
}

import {
    getCloudStorageSnapshot,
    setCloudStorageSession,
} from "./cloud-storage-policy";

type ConsentOperationState = { saving: boolean; error: string | null };
type Options = {
    readConsent: (ownerUserId: number) => Promise<boolean>;
    writeConsent: (ownerUserId: number, enabled: boolean) => Promise<void>;
    onState?: (state: ConsentOperationState) => void;
};

const disableSaveError =
    "云存储已暂停，但关闭设置保存失败；请重试保存，避免重启后恢复旧设置";

/** Serial account writes, immediate revocation, and receipts tied to the active session. */
export function createCloudStorageConsentController(options: Options) {
    let owner: number | null = null;
    let activation = 0;
    let sequence = 0;
    let state: ConsentOperationState = { saving: false, error: null };
    const listeners = new Set<() => void>();
    const writes = new Map<number, Promise<void>>();
    const latestIntent = new Map<number, number>();
    // A failed revocation must remain denied through account/token changes in this process.
    const unpersistedRevocations = new Set<number>();
    const update = (next: ConsentOperationState) => {
        if (state.saving === next.saving && state.error === next.error) return;
        state = next;
        options.onState?.(state);
        for (const listener of listeners) listener();
    };

    return {
        getState: () => state,
        subscribe(listener: () => void) {
            listeners.add(listener);
            return () => {
                listeners.delete(listener);
            };
        },
        activate(nextOwner: number | null, loading = false) {
            const session = ++activation;
            owner = nextOwner;
            update({ saving: false, error: null });
            setCloudStorageSession(owner, owner === null && !loading, false);
            const generation = getCloudStorageSnapshot().generation;
            const current = () =>
                activation === session &&
                owner === nextOwner &&
                getCloudStorageSnapshot().generation === generation &&
                getCloudStorageSnapshot().ownerUserId === nextOwner;
            if (nextOwner === null) return;
            void (async () => {
                // Re-entering an account cannot read a value older than its pending last choice.
                await writes.get(nextOwner);
                if (!current()) return;
                const consented = await options.readConsent(nextOwner);
                if (!current()) return;
                const revoked = unpersistedRevocations.has(nextOwner);
                setCloudStorageSession(
                    nextOwner,
                    true,
                    revoked ? false : consented,
                );
                if (revoked) update({ saving: false, error: disableSaveError });
            })().catch(() => {
                if (!current()) return;
                setCloudStorageSession(nextOwner, true, false);
                update({
                    saving: false,
                    error: "无法读取云存储授权，已暂停云存储，请重新设置授权",
                });
            });
        },
        deactivate() {
            ++activation;
            owner = null;
            update({ saving: false, error: null });
            setCloudStorageSession(null, false, false);
        },
        setConsent(
            expectedOwner: number | null,
            enabled: boolean,
        ): Promise<void> {
            const before = getCloudStorageSnapshot();
            if (
                expectedOwner === null ||
                owner !== expectedOwner ||
                before.ownerUserId !== expectedOwner ||
                !before.ready ||
                (enabled && !before.available)
            )
                return Promise.resolve();
            const session = activation;
            const intent = ++sequence;
            latestIntent.set(expectedOwner, intent);
            if (!enabled) {
                unpersistedRevocations.add(expectedOwner);
                setCloudStorageSession(expectedOwner, true, false);
            }
            const generation = getCloudStorageSnapshot().generation;
            const current = () =>
                activation === session &&
                owner === expectedOwner &&
                latestIntent.get(expectedOwner) === intent &&
                getCloudStorageSnapshot().generation === generation &&
                getCloudStorageSnapshot().ownerUserId === expectedOwner;
            update({ saving: true, error: null });
            const previous = writes.get(expectedOwner) ?? Promise.resolve();
            const pending = previous
                .then(() => options.writeConsent(expectedOwner, enabled))
                .then(
                    () => {
                        if (latestIntent.get(expectedOwner) === intent) {
                            unpersistedRevocations.delete(expectedOwner);
                        }
                        if (!current()) return;
                        setCloudStorageSession(expectedOwner, true, enabled);
                        update({ saving: false, error: null });
                    },
                    () => {
                        if (!current()) return;
                        update({
                            saving: false,
                            error: enabled
                                ? "授权保存失败，云存储仍未开启，请重试"
                                : disableSaveError,
                        });
                    },
                )
                .finally(() => {
                    if (writes.get(expectedOwner) === pending)
                        writes.delete(expectedOwner);
                    if (
                        activation === session &&
                        latestIntent.get(expectedOwner) === intent &&
                        state.saving
                    ) {
                        update({ saving: false, error: state.error });
                    }
                });
            writes.set(expectedOwner, pending);
            return pending;
        },
    };
}

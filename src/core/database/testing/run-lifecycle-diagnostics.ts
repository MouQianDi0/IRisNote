import { SharedDatabaseResource } from "../shared-database-resource";

function deferred() {
    let resolve!: () => void;
    const promise = new Promise<void>((complete) => { resolve = complete; });
    return { promise, resolve };
}

/** 只使用内存假资源，覆盖 SQLite 之外的初始化 / 租约 / 关闭时序。 */
export async function runLifecycleDiagnostics(
    check: (name: string, passed: boolean) => void,
) {
    const initialization = deferred();
    const opened = deferred();
    const closing = deferred();
    const closed = deferred();
    let opens = 0;
    let closes = 0;
    const resource = new SharedDatabaseResource(async () => {
        opens += 1;
        opened.resolve();
        await initialization.promise;
        return {
            close: async () => {
                closes += 1;
                closing.resolve();
                await closed.promise;
            },
        };
    });
    const first = resource.acquire();
    const second = resource.acquire();
    await opened.promise;
    check("shared-initialization", first.ready === second.ready && opens === 1);
    await first.release();
    check("shared-lease-keeps-connection", closes === 0 && second.active);
    const release = second.release();
    check("release-idempotency", release === second.release());
    const next = resource.acquire();
    check("close-waits-for-initialization", closes === 0);
    initialization.resolve();
    await closing.promise;
    check("reopen-waits-for-close", opens === 1 && closes === 1);
    closed.resolve();
    await release;
    await next.ready;
    await next.release();
    check("lease-reopen-and-close-once", opens === 2 && closes === 2);

    const failure = new Error("DIAGNOSTIC_INITIALIZATION_FAILURE");
    let attempts = 0;
    const retryable = new SharedDatabaseResource(async () => {
        if (++attempts === 1) throw failure;
        return { close: async () => undefined };
    });
    const failed = retryable.acquire();
    const received = await failed.ready.catch((error: unknown) => error);
    await failed.release();
    const retry = retryable.acquire();
    await retry.ready;
    await retry.release();
    check("initialization-failure-release-and-retry", received === failure && attempts === 2);

    const closeFailure = new Error("DIAGNOSTIC_CLOSE_FAILURE");
    let unsafeOpens = 0;
    const unsafe = new SharedDatabaseResource(async () => {
        unsafeOpens += 1;
        return { close: async () => { throw closeFailure; } };
    });
    const unsafeLease = unsafe.acquire();
    await unsafeLease.ready;
    const failedClose = await unsafeLease.release().catch((error: unknown) => error);
    check("close-failure-propagated", failedClose === closeFailure);
    for (let attempt = 0; attempt < 2; attempt += 1) {
        const blocked = unsafe.acquire();
        const blockedOpen = await blocked.ready.catch((error: unknown) => error);
        const blockedRelease = await blocked.release().catch((error: unknown) => error);
        check(`close-failure-blocks-reopen-${attempt + 1}`,
            blockedOpen === closeFailure && blockedRelease === closeFailure && unsafeOpens === 1);
    }
}

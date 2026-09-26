/** Build availability and device/account consent are independent. No React/native imports. */
export function parseCloudStorageEnabled(value: string | undefined): boolean {
    const normalized = value?.trim();
    return normalized == null || normalized === "" || normalized === "1";
}

export type CloudStorageSnapshot = {
    available: boolean;
    ownerUserId: number | null;
    ready: boolean;
    consented: boolean;
    enabled: boolean;
    generation: number;
};

let snapshot: CloudStorageSnapshot = {
    available: parseCloudStorageEnabled(
        process.env.EXPO_PUBLIC_CLOUD_STORAGE_ENABLED,
    ),
    ownerUserId: null,
    ready: false,
    consented: false,
    enabled: false,
    generation: 0,
};
const listeners = new Set<() => void>();
const controllers = new Set<AbortController>();

export const getCloudStorageSnapshot = () => snapshot;
export function subscribeCloudStorage(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function setCloudStorageSession(
    ownerUserId: number | null,
    ready: boolean,
    consented: boolean,
) {
    if (
        snapshot.ownerUserId === ownerUserId &&
        snapshot.ready === ready &&
        snapshot.consented === consented
    )
        return;
    snapshot = {
        ...snapshot,
        ownerUserId,
        ready,
        consented,
        enabled:
            snapshot.available && ownerUserId !== null && ready && consented,
        generation: snapshot.generation + 1,
    };
    // Revoke synchronously, before notifying React or running effect cleanup.
    for (const controller of controllers) controller.abort();
    controllers.clear();
    for (const listener of listeners) listener();
}

export function cloudStorageStatusLabel(state: CloudStorageSnapshot): string {
    if (!state.available) return "当前版本未开放云存储";
    if (state.ownerUserId === null) return "请先登录";
    if (!state.ready) return "正在读取授权";
    return state.enabled ? "已允许云存储" : "仅本机保存";
}

export class CloudStoragePermissionError extends Error {
    readonly code = "CLOUD_STORAGE_PERMISSION_REQUIRED";
    config?: object;
    constructor(
        message = snapshot.available
            ? "需要开启云存储，请前往设置 → 同步与备份"
            : "当前版本未开放云存储",
        readonly requestDispatched = false,
    ) {
        super(message);
        this.name = "CloudStoragePermissionError";
    }
}

export function isCloudStoragePermissionError(
    error: unknown,
): error is CloudStoragePermissionError {
    return (
        error instanceof CloudStoragePermissionError ||
        (typeof error === "object" &&
            error !== null &&
            "code" in error &&
            error.code === "CLOUD_STORAGE_PERMISSION_REQUIRED")
    );
}
export const isCloudStorageRequestDispatched = (error: unknown) =>
    isCloudStoragePermissionError(error) && error.requestDispatched === true;

export function assertCloudStorageAllowed(ownerUserId?: number) {
    if (
        !snapshot.enabled ||
        (ownerUserId !== undefined && snapshot.ownerUserId !== ownerUserId)
    ) {
        throw new CloudStoragePermissionError();
    }
}

export function captureCloudStorageAccess(ownerUserId?: number): () => void {
    assertCloudStorageAllowed(ownerUserId);
    const generation = snapshot.generation;
    return () => {
        assertCloudStorageAllowed(ownerUserId);
        if (generation !== snapshot.generation) {
            throw new CloudStoragePermissionError(
                "云存储授权或账号已变化，请重新操作",
            );
        }
    };
}

export function createCloudStorageRequest() {
    const assertCurrent = captureCloudStorageAccess();
    const controller = new AbortController();
    controllers.add(controller);
    return {
        signal: controller.signal,
        assertCurrent,
        release: () => {
            controllers.delete(controller);
        },
    };
}

/** Only essential account calls bypass consent. Unknown/future API routes are protected. */
export function isEssentialAccountRequest(
    method: string | undefined,
    url: string | undefined,
): boolean {
    const verb = (method ?? "get").toLowerCase();
    if (verb === "get" && url === "/user/profile") return true;
    return (
        verb === "post" &&
        [
            "/auth/register",
            "/auth/login",
            "/auth/login-code",
            "/verify/send",
            "/verify/check",
        ].includes(url ?? "")
    );
}

import { Directory, File, Paths } from "expo-file-system";
import { Platform } from "react-native";
import {
    AVATAR_CACHE_MAX_BYTES,
    looksLikeAvatarImage,
} from "../utils/avatar-cache-key";

/**
 * 头像本地缓存：`Paths.document/avatars/<用户ID>/<文件名>`，每个用户只保留当前文件。
 * 放在 document 而非 cache，避免被系统回收；退出登录保留（按账号目录隔离）。
 */
const AVATAR_DIRECTORY = "avatars";

const known = new Map<string, string | null>();
const inflight = new Map<string, Promise<void>>();
/** 本次运行中显示失败的文件不再自动下载，避免损坏文件导致反复下载。 */
const rejected = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;

const supported = Platform.OS !== "web";
const cacheKey = (userId: number, name: string) => `${userId}/${name}`;

function notify() {
    version += 1;
    listeners.forEach((listener) => listener());
}

export function subscribeAvatarCache(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function getAvatarCacheVersion() {
    return version;
}

function userDirectory(userId: number) {
    return new Directory(Paths.document, AVATAR_DIRECTORY, String(userId));
}

/** 已缓存文件的本地 URI；未缓存或平台不支持时返回 null。 */
export function readCachedAvatar(userId: number, name: string): string | null {
    if (!supported) return null;
    const key = cacheKey(userId, name);
    if (known.has(key)) return known.get(key) ?? null;
    let uri: string | null = null;
    try {
        const file = new File(userDirectory(userId), name);
        uri = file.exists && file.size > 0 ? file.uri : null;
    } catch {
        uri = null;
    }
    known.set(key, uri);
    return uri;
}

/** 删除该用户目录中除当前文件外的旧头像与残留临时文件。 */
function pruneOthers(directory: Directory, keep: string) {
    try {
        for (const entry of directory.list()) {
            if (entry instanceof File && entry.name !== keep) entry.delete();
        }
    } catch {
        // 清理失败不影响当前头像显示，下次写入时再清理
    }
}

async function commit(
    userId: number,
    name: string,
    produce: (temporary: File) => Promise<void>,
) {
    const directory = userDirectory(userId);
    directory.create({ intermediates: true, idempotent: true });
    const temporary = new File(directory, `.pending-${name}`);
    try {
        if (temporary.exists) temporary.delete();
        await produce(temporary);
        const size = temporary.size;
        if (
            !temporary.exists ||
            size <= 0 ||
            size > AVATAR_CACHE_MAX_BYTES ||
            !looksLikeAvatarImage(await temporary.bytes())
        ) {
            throw new Error("头像缓存文件无效");
        }
        const target = new File(directory, name);
        if (target.exists) target.delete();
        await temporary.move(target);
        pruneOthers(directory, name);
        known.set(cacheKey(userId, name), target.uri);
        notify();
    } finally {
        try {
            if (temporary.exists) temporary.delete();
        } catch {
            // 临时文件会在下次写入同一用户目录时被清理
        }
    }
}

/** 后台下载远程头像到本地；同一文件同时只下载一次，失败时静默保留远程显示。 */
export function ensureCachedAvatar(
    userId: number,
    name: string,
    url: string,
): Promise<void> {
    const key = cacheKey(userId, name);
    if (!supported || rejected.has(key) || readCachedAvatar(userId, name)) {
        return Promise.resolve();
    }
    const running = inflight.get(key);
    if (running) return running;
    const task = commit(userId, name, async (temporary) => {
        await File.downloadFileAsync(url, temporary, { idempotent: true });
    })
        .catch(() => undefined)
        .finally(() => inflight.delete(key));
    inflight.set(key, task);
    return task;
}

/** 上传成功后直接用本地已有的图片数据写入缓存，避免再下载一次。 */
export async function writeCachedAvatar(
    userId: number,
    name: string,
    base64: string,
): Promise<void> {
    if (!supported) return;
    await commit(userId, name, async (temporary) => {
        temporary.create();
        temporary.write(base64, { encoding: "base64" });
    });
}

/** 本地文件无法显示（损坏或被外部删除）时移除记录，回退为远程或默认图标。 */
export function dropCachedAvatar(userId: number, name: string) {
    if (!supported) return;
    try {
        const file = new File(userDirectory(userId), name);
        if (file.exists) file.delete();
    } catch {
        // 删除失败时仍回退显示，下次写入会覆盖
    }
    const key = cacheKey(userId, name);
    rejected.add(key);
    known.set(key, null);
    notify();
}

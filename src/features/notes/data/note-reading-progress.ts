import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ApplicationDatabase } from "@/core/database";
import { recordDiagnostic } from "@/core/diagnostics/diagnostic-log";
import { ReadingProgressStore } from "../reading/reading-progress-store";
import {
    migrateLegacyReadingProgress,
    sqliteReadingStorage,
} from "./note-reading-progress.repository";

const stores = new WeakMap<ApplicationDatabase, ReadingProgressStore>();

/**
 * 每个数据库对应一个阅读进度 store（写入队列与失败暂存都在 store 内）。
 * 首次创建时顺带把旧版 AsyncStorage 数据搬进 SQLite；搬迁失败只记诊断，旧数据保留到下次启动重试。
 */
export function readingProgressStoreFor(database: ApplicationDatabase) {
    let store = stores.get(database);
    if (!store) {
        const ready = migrateLegacyReadingProgress(database, AsyncStorage).catch(
            () =>
                void recordDiagnostic(
                    "reading",
                    "legacy_migration_failed",
                    undefined,
                    "warning",
                ),
        );
        store = new ReadingProgressStore(sqliteReadingStorage(database, ready));
        stores.set(database, store);
    }
    return store;
}

const readingProgressListeners = new Set<(ownerUserId: number) => void>();

export function onReadingProgressChanged(listener: (ownerUserId: number) => void) {
    readingProgressListeners.add(listener);
    return () => {
        readingProgressListeners.delete(listener);
    };
}

export function notifyReadingProgressChanged(ownerUserId: number) {
    readingProgressListeners.forEach((listener) => listener(ownerUserId));
}

/** Compatibility facade for the note information popover. */
export async function readReadingProgress(
    database: ApplicationDatabase,
    owner: number,
    id: number,
): Promise<number | null> {
    try {
        const value = (await readingProgressStoreFor(database).read(owner, id))
            ?.percent;
        return value === undefined ? null : Math.round(value);
    } catch {
        return null;
    }
}

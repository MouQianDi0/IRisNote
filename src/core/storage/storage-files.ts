import {
    updateSupported,
    useUpdateStore,
} from "@/features/updates/update-store";
import {
    DIAGNOSTIC_BACKUP_DATABASE_NAME,
    DIAGNOSTIC_DATABASE_NAME,
} from "@/core/database/database.constants";
import {
    DIAGNOSTIC_EXPORT_PATTERN,
    DIAGNOSTIC_LOG_FILE,
} from "@/core/diagnostics/diagnostic-log";
import * as Application from "expo-application";
import { Directory, File, Paths } from "expo-file-system";
import { defaultDatabaseDirectory } from "expo-sqlite";
import { Platform } from "react-native";
import {
    isShareFileActive,
    shareCacheDirectory,
    shareFileIdentity,
} from "./share-cache";
import {
    expiredShareFile,
    installedUpdateFile,
    type CleanupSelection,
} from "./storage-policy";

type Kind =
    | "database"
    | "drafts"
    | "updates"
    | "shares"
    | "avatars"
    | "diagnostics"
    | "other";
export type StorageFile = {
    uri: string;
    bytes: number;
    modified: number | null;
    kind: Kind;
    cleanable: boolean;
};
export type StorageScan = {
    supported: boolean;
    files: StorageFile[];
    totals: Record<Kind, number>;
    cleanable: { updates: number; shares: number; diagnostics: number };
    errors: number;
};
const inside = (uri: string, directory: string) =>
    uri.startsWith(directory.replace(/\/$/, "") + "/");
const UPDATE_FILE_PATTERN = /^irisnote-release-[1-9]\d*\.(apk|hdiff)$/;
const emptyScan = (): StorageScan => ({
    supported: Platform.OS !== "web",
    files: [],
    totals: {
        database: 0,
        drafts: 0,
        updates: 0,
        shares: 0,
        avatars: 0,
        diagnostics: 0,
        other: 0,
    },
    cleanable: { updates: 0, shares: 0, diagnostics: 0 },
    errors: 0,
});

/** SQLite returns a native path on Android/iOS; FileSystem expects a URI. */
export function databaseDirectoryUri(path: string): string {
    if (/[\u0000-\u001f]/.test(path)) throw new Error("数据库目录路径无效");
    if (path.startsWith("file:///")) return path;
    if (path.startsWith("/") && !path.startsWith("//")) {
        return `file://${path.split("/").map(encodeURIComponent).join("/")}`;
    }
    throw new Error("数据库目录不是绝对本地路径");
}
const updateInUse = () =>
    [
        "downloading",
        "verifying",
        "merging",
        "permission",
        "saving",
        "installing",
    ].includes(useUpdateStore.getState().phase);

/** 可清理的诊断文件：日志与导出副本；开发环境的诊断数据库只统计，不清理。 */
const removableDiagnostic = (file: File) =>
    file.name === DIAGNOSTIC_LOG_FILE ||
    DIAGNOSTIC_EXPORT_PATTERN.test(file.name);

const DIAGNOSTIC_DATABASES = [
    DIAGNOSTIC_DATABASE_NAME,
    DIAGNOSTIC_BACKUP_DATABASE_NAME,
];

function canRemove(file: File, kind: Kind) {
    if (kind === "diagnostics") return removableDiagnostic(file);
    if (kind === "updates")
        return (
            updateSupported() &&
            !updateInUse() &&
            useUpdateStore.getState().fileUri !== file.uri &&
            installedUpdateFile(file.name, Application.nativeBuildVersion)
        );
    if (kind !== "shares" || isShareFileActive(file.uri)) return false;
    const identity = shareFileIdentity(file);
    if (!identity) return false;
    const usage = new File(file.parentDirectory, `${file.name}.used`);
    const lastUsed = usage.exists
        ? Number(usage.textSync())
        : file.modificationTime;
    const modified = file.modificationTime;
    return (
        modified !== null &&
        lastUsed !== null &&
        Number.isFinite(lastUsed) &&
        expiredShareFile(identity, Math.max(modified, lastUsed))
    );
}

/** 登记一个已分类的文件；大小或修改时间无法读取时只计入错误数。 */
function addScannedFile(result: StorageScan, entry: File, kind: Kind) {
    const bytes = entry.size;
    const modified = entry.modificationTime;
    if (modified === null || !Number.isFinite(bytes) || bytes < 0) {
        result.errors++;
        return;
    }
    const cleanable = canRemove(entry, kind);
    result.files.push({ uri: entry.uri, bytes, modified, kind, cleanable });
    result.totals[kind] += bytes;
    if (
        cleanable &&
        (kind === "updates" || kind === "shares" || kind === "diagnostics")
    )
        result.cleanable[kind] += bytes;
}

/**
 * 只扫描缓存目录里的更新包和分享临时文件，供启动时自动清理；
 * 不遍历文档和数据库目录，判定规则与完整扫描相同。
 */
export function scanCacheCleanupCandidates(): StorageScan {
    const result = emptyScan();
    if (!result.supported) return result;
    const add = (entry: File | Directory, kind: "updates" | "shares") => {
        if (!(entry instanceof File)) return;
        try {
            addScannedFile(result, entry, kind);
        } catch {
            result.errors++;
        }
    };
    try {
        for (const entry of Paths.cache.list())
            if (UPDATE_FILE_PATTERN.test(entry.name)) add(entry, "updates");
    } catch {
        result.errors++;
    }
    try {
        const shares = shareCacheDirectory();
        if (shares.exists)
            for (const entry of shares.list()) {
                try {
                    const files =
                        entry instanceof Directory ? entry.list() : [entry];
                    for (const file of files)
                        if (file instanceof File && shareFileIdentity(file))
                            add(file, "shares");
                } catch {
                    result.errors++;
                }
            }
    } catch {
        result.errors++;
    }
    return result;
}

export async function scanStorageFiles(): Promise<StorageScan> {
    const result = emptyScan();
    if (!result.supported) return result;
    const roots: Directory[] = [];
    let databaseUri: string | null = null;
    let draftsUri: string | null = null;
    let avatarsUri: string | null = null;
    const addRoot = (create: () => Directory) => {
        try {
            const directory = create();
            // Access the native URI getter inside the guard, too.
            const uri = directory.uri;
            roots.push(directory);
            return uri;
        } catch {
            result.errors++;
            return null;
        }
    };
    const documentUri = addRoot(() => Paths.document);
    addRoot(() => Paths.cache);
    if (documentUri) {
        try {
            draftsUri = new Directory(documentUri, "drafts").uri;
            avatarsUri = new Directory(documentUri, "avatars").uri;
        } catch {
            result.errors++;
        }
    }
    if (defaultDatabaseDirectory) {
        databaseUri = addRoot(
            () => new Directory(databaseDirectoryUri(defaultDatabaseDirectory)),
        );
    }
    const visited = new Set<string>();
    const pending = [...roots];
    let processed = 0;
    while (pending.length) {
        const directory = pending.pop()!;
        try {
            const uri = directory.uri;
            if (visited.has(uri)) continue;
            visited.add(uri);
            if (!directory.exists) continue;
            for (const entry of directory.list()) {
                if (entry instanceof Directory) {
                    pending.push(entry);
                    continue;
                }
                if (visited.has(entry.uri)) continue;
                visited.add(entry.uri);
                try {
                    let kind: Kind = "other";
                    if (draftsUri && inside(entry.uri, draftsUri))
                        kind = "drafts";
                    else if (
                        (entry.parentDirectory.uri === Paths.document.uri &&
                            entry.name === DIAGNOSTIC_LOG_FILE) ||
                        (entry.parentDirectory.uri === Paths.cache.uri &&
                            DIAGNOSTIC_EXPORT_PATTERN.test(entry.name)) ||
                        (databaseUri &&
                            inside(entry.uri, databaseUri) &&
                            DIAGNOSTIC_DATABASES.some(
                                (name) =>
                                    entry.name === name ||
                                    entry.name.startsWith(`${name}-`),
                            ))
                    )
                        kind = "diagnostics";
                    else if (databaseUri && inside(entry.uri, databaseUri))
                        kind = "database";
                    else if (avatarsUri && inside(entry.uri, avatarsUri))
                        kind = "avatars";
                    else if (
                        entry.parentDirectory.uri === Paths.cache.uri &&
                        UPDATE_FILE_PATTERN.test(entry.name)
                    )
                        kind = "updates";
                    else if (shareFileIdentity(entry)) kind = "shares";
                    addScannedFile(result, entry, kind);
                } catch {
                    result.errors++;
                }
                if (++processed % 40 === 0)
                    await new Promise<void>((resolve) =>
                        setTimeout(resolve, 0),
                    );
            }
        } catch {
            result.errors++;
        }
    }
    return result;
}

export async function clearStorageFiles(
    scan: StorageScan,
    selected: CleanupSelection,
    check: () => void,
) {
    let released = 0,
        failed = 0,
        skipped = 0;
    for (const item of scan.files) {
        if (
            !item.cleanable ||
            (item.kind !== "updates" && item.kind !== "shares") ||
            !selected[item.kind]
        )
            continue;
        try {
            check();
        } catch {
            return { released, failed, skipped, interrupted: true };
        }
        try {
            const file = new File(item.uri);
            if (
                !file.exists ||
                file.size !== item.bytes ||
                file.modificationTime !== item.modified ||
                !canRemove(file, item.kind)
            ) {
                skipped++;
                continue;
            }
            check();
            file.delete();
            released += item.bytes;
            if (item.kind === "shares") {
                const usage = new File(
                    file.parentDirectory,
                    `${file.name}.used`,
                );
                if (usage.exists) {
                    const bytes = usage.size;
                    usage.delete();
                    released += bytes;
                }
                const directory = file.parentDirectory;
                if (
                    directory.parentDirectory.uri ===
                        shareCacheDirectory().uri &&
                    directory.list().length === 0
                )
                    directory.delete();
            }
        } catch {
            failed++;
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return { released, failed, skipped, interrupted: false };
}

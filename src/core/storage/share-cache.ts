import { Directory, File, Paths } from "expo-file-system";

export const SHARE_DIRECTORY = "irisnote-shares";
let sequence = 0;
const active = new Map<string, number>();
export function shareCacheDirectory() {
    return new Directory(Paths.cache, SHARE_DIRECTORY);
}
export function createShareCacheFile(
    extension: "txt" | "md" | "pdf" | "png",
    displayName = `note.${extension}`,
) {
    if (
        /[\\/\u0000-\u001f]/.test(displayName) ||
        !displayName.endsWith(`.${extension}`)
    )
        throw new Error("分享文件名无效");
    const directory = new Directory(
        shareCacheDirectory(),
        `share-${Date.now().toString(36)}-${(++sequence).toString(36)}`,
    );
    directory.create({ intermediates: true, idempotent: true });
    return new File(directory, displayName);
}
export function shareFileIdentity(file: File): string | null {
    const parent = file.parentDirectory;
    const root = shareCacheDirectory().uri;
    const nameMatch = /^share-[a-z0-9-]+\.(txt|md|pdf|png)$/.exec(file.name);
    if (parent.uri === root && nameMatch?.[0] === file.name) return file.name;
    const directoryMatch = /^share-[a-z0-9-]+$/.exec(parent.name);
    if (
        parent.parentDirectory.uri === root &&
        directoryMatch?.[0] === parent.name &&
        [".txt", ".md", ".pdf", ".png"].includes(file.extension)
    )
        return parent.name + file.extension;
    return null;
}
export function isShareFileActive(uri: string) {
    return active.has(uri);
}
export async function withSharedFile<T>(
    uri: string,
    task: () => Promise<T>,
): Promise<T> {
    active.set(uri, (active.get(uri) ?? 0) + 1);
    const markUsed = (value: string) => {
        const file = new File(uri);
        if (file.exists && shareFileIdentity(file)) {
            new File(file.parentDirectory, `${file.name}.used`).write(value);
        }
    };
    try {
        markUsed("active");
        return await task();
    } finally {
        // Refresh retention after the panel closes; receiving apps may still be reading.
        const remaining = (active.get(uri) ?? 1) - 1;
        if (remaining > 0) active.set(uri, remaining);
        else {
            try {
                markUsed(String(Date.now()));
                active.delete(uri);
            } catch {
                // Keep the active marker on disk and in memory if retention cannot be saved.
                console.warn("[Storage] 分享文件使用状态保存失败，文件已保留");
            }
        }
    }
}

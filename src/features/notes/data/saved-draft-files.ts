import { Directory, File, Paths } from "expo-file-system";

function directory(owner: number) {
    if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error("草稿账户无效");
    return new Directory(Paths.document, "drafts", String(owner));
}
function file(owner: number, key: string, suffix = ".json") {
    return new File(directory(owner), encodeURIComponent(key) + suffix);
}

export const savedDraftFiles = {
    async keys(owner: number): Promise<string[]> {
        const dir = directory(owner);
        if (!dir.exists) return [];
        return [...new Set(dir.list().filter((entry) => entry instanceof File && /\.(json|bak)$/.test(entry.name))
            .map((entry) => decodeURIComponent(entry.name.replace(/\.(json|bak)$/, ""))))];
    },
    async read(owner: number, key: string): Promise<string | null> {
        const primary = file(owner, key);
        const backup = file(owner, key, ".bak");
        if (primary.exists) {
            const text = primary.textSync();
            try { JSON.parse(text); return text; } catch { /* 中断写入时尝试上一版。 */ }
        }
        if (backup.exists) return backup.textSync();
        if (primary.exists) throw new Error("草稿文件损坏，原文件已保留");
        return null;
    },
    async write(owner: number, key: string, text: string) {
        const dir = directory(owner);
        dir.create({ intermediates: true, idempotent: true });
        const previous = await this.read(owner, key);
        if (previous !== null) file(owner, key, ".bak").write(previous);
        file(owner, key).write(text);
        if (file(owner, key).textSync() !== text) throw new Error("草稿文件校验失败，恢复副本已保留");
        const backup = file(owner, key, ".bak");
        if (backup.exists) backup.delete();
    },
    async remove(owner: number, key: string) {
        // 先移除备份，避免主文件删除后备份被当成未完成草稿重新恢复。
        for (const suffix of [".bak", ".json"]) {
            const target = file(owner, key, suffix);
            if (target.exists) target.delete();
        }
    },
};

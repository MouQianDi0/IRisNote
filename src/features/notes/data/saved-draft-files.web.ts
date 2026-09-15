async function directory(owner: number, create = false) {
    if (!Number.isSafeInteger(owner) || owner <= 0) throw new Error("草稿账户无效");
    const root = await navigator.storage.getDirectory();
    const drafts = await root.getDirectoryHandle("drafts", { create });
    return drafts.getDirectoryHandle(String(owner), { create });
}
const missing = (cause: unknown) => cause instanceof DOMException && cause.name === "NotFoundError";

/** Web 使用来源私有文件系统，与原生一样按账户分目录；不触碰用户下载目录。 */
export const savedDraftFiles = {
    async keys(owner: number): Promise<string[]> {
        try {
            const dir = await directory(owner);
            const keys: string[] = [];
            // TypeScript DOM 库未声明 FileSystemDirectoryHandle 的异步迭代接口。
            const entries = dir as FileSystemDirectoryHandle & { keys(): AsyncIterableIterator<string> };
            for await (const name of entries.keys()) if (name.endsWith(".json")) keys.push(decodeURIComponent(name.slice(0, -5)));
            return keys;
        } catch (cause) { if (missing(cause)) return []; throw cause; }
    },
    async read(owner: number, key: string): Promise<string | null> {
        try {
            const handle = await (await directory(owner)).getFileHandle(encodeURIComponent(key) + ".json");
            return (await handle.getFile()).text();
        } catch (cause) { if (missing(cause)) return null; throw cause; }
    },
    async write(owner: number, key: string, text: string) {
        const handle = await (await directory(owner, true)).getFileHandle(encodeURIComponent(key) + ".json", { create: true });
        const stream = await handle.createWritable();
        try { await stream.write(text); await stream.close(); }
        catch (cause) { await stream.abort().catch(() => undefined); throw cause; }
    },
    async remove(owner: number, key: string) {
        try { await (await directory(owner)).removeEntry(encodeURIComponent(key) + ".json"); }
        catch (cause) { if (!missing(cause)) throw cause; }
    },
};

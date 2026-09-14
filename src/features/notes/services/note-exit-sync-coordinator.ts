import type { ApplicationDatabase } from "@/core/database";
import { banner, captureNotificationSession } from "@/core/notifications";
import type { DraftCommit } from "../data/note-draft.repository";
import { getLocalNoteByClientId } from "../data/note-local.repository";
import { enqueueNoteUpload } from "@/features/sync";

const tasks = new Map<string, Promise<void>>();

/**
 * 页面退出后串行写入持久化上传队列。网络与服务器确认由全局协调器负责。
 */
export function enqueueNoteExitSync(
    database: ApplicationDatabase,
    owner: number,
    clientId: number,
    draft: DraftCommit,
) {
    const key = `${owner}:${clientId}`;
    const sessionCurrent = captureNotificationSession();
    const previous = tasks.get(key) ?? Promise.resolve();
    const task = previous.catch(() => undefined).then(async () => {
        try {
            const note = await getLocalNoteByClientId(database, owner, clientId);
            if (!note) throw new Error("本地笔记不存在，无法加入上传队列");
            await enqueueNoteUpload(database, owner, note, draft);
        } catch (cause: unknown) {
            console.error("[Note sync] 退出页面后的入队任务失败", {
                owner,
                clientId,
                message: cause instanceof Error ? cause.message : "unknown_error",
            });
            if (sessionCurrent()) {
                banner.show({
                    id: `note-exit-sync:${key}`,
                    type: "important",
                    title: "笔记已保存到本机，暂存未完成",
                    message: "自动上传任务未能加入本地队列，请稍后重新打开笔记",
                    lifetime: { mode: "persistent" },
                });
            }
        }
    }).finally(() => {
        if (tasks.get(key) === task) tasks.delete(key);
    });
    tasks.set(key, task);
}

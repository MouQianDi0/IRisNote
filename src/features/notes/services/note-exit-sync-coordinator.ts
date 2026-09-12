import type { ApplicationDatabase } from "@/core/database";
import { banner, captureNotificationSession } from "@/core/notifications";
import type { DraftCommit } from "../data/note-draft.repository";
import { uploadStagedNoteAfterExit } from "./note-save.service";

const tasks = new Map<string, Promise<void>>();

/**
 * 页面退出后串行上传同一篇笔记。任务不依赖已卸载页面；普通成功保持静默。
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
        const noticeId = `note-exit-sync:${key}`;
        try {
            const result = await uploadStagedNoteAfterExit(
                database,
                owner,
                clientId,
                draft,
            );
            if (!sessionCurrent()) return;
            if (result.cloudState === "accepted") {
                banner.dismiss(noticeId);
                return;
            }
            banner.show({
                id: noticeId,
                type: "important",
                title: "笔记已保存到本机，云端同步未完成",
                message:
                    result.cloudState === "unknown"
                        ? "云端接收结果未知，请稍后检查同步状态"
                        : "云端未接受保存，请稍后重试",
                lifetime: { mode: "persistent" },
            });
        } catch (cause: unknown) {
            console.error("[Note sync] 退出页面后的上传任务失败", {
                owner,
                clientId,
                message: cause instanceof Error ? cause.message : "unknown_error",
            });
            if (sessionCurrent()) {
                banner.show({
                    id: noticeId,
                    type: "important",
                    title: "笔记已保存到本机，云端同步未完成",
                    message: "退出后的上传任务未完成，请稍后重试",
                    lifetime: { mode: "persistent" },
                });
            }
        }
    }).finally(() => {
        if (tasks.get(key) === task) tasks.delete(key);
    });
    tasks.set(key, task);
}

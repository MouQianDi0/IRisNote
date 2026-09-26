import type { ApplicationDatabase } from "@/core/database";
import { cancelUploadTask, type UploadQueueTask } from "@/core/sync";
import { notifyCategoriesChanged } from "@/features/notes/categories/categories.events";
import {
    getNoteQueueRollbackAvailability,
    rollbackQueuedLocalNoteToPreviousRevision,
} from "@/features/notes/data/note-local.repository";
import { setCachedNote } from "@/features/notes/notes.cache";
import { notifyNotesChanged } from "@/features/notes/notes.events";
import type { Note } from "@/features/notes/notes.types";

export type UploadTaskCancellationAvailability =
    { allowed: true } | { allowed: false; reason: string };

const noteTaskIdentity = (task: UploadQueueTask) => {
    const clientId = task.payload.clientId;
    const revisionId = task.payload.revisionId;
    if (
        typeof clientId !== "number" ||
        !Number.isFinite(clientId) ||
        typeof revisionId !== "string" ||
        !revisionId
    ) {
        throw new Error("[Upload queue] 笔记任务缺少有效的版本信息");
    }
    return { clientId, revisionId };
};

/** 生成删除按钮状态；确认时仍会在事务内再次验证。 */
export async function getUploadTaskCancellationAvailability(
    database: ApplicationDatabase,
    task: UploadQueueTask,
): Promise<UploadTaskCancellationAvailability> {
    if (task.status === "running") {
        return { allowed: false, reason: "任务正在上传，暂时无法回滚" };
    }
    if (task.kind !== "note-sync") return { allowed: true };

    try {
        const { clientId, revisionId } = noteTaskIdentity(task);
        return getNoteQueueRollbackAvailability(
            database,
            task.ownerUserId,
            clientId,
            revisionId,
        );
    } catch (cause) {
        return {
            allowed: false,
            reason: cause instanceof Error ? cause.message : "任务版本信息无效",
        };
    }
}

/** 队列删除与笔记回滚共用一个 SQLite 事务，避免仅完成其中一半。 */
export async function cancelUploadTaskWithLocalRollback(
    database: ApplicationDatabase,
    ownerUserId: number,
    taskId: string,
) {
    const outcome: { restoredNote: Note | null } = { restoredNote: null };
    const task = await cancelUploadTask(
        database,
        ownerUserId,
        taskId,
        async (transaction, currentTask) => {
            if (currentTask.kind !== "note-sync") return;
            const { clientId, revisionId } = noteTaskIdentity(currentTask);
            outcome.restoredNote =
                await rollbackQueuedLocalNoteToPreviousRevision(
                    transaction,
                    ownerUserId,
                    clientId,
                    revisionId,
                    currentTask.attemptCount > 0,
                );
        },
    );

    if (outcome.restoredNote) {
        setCachedNote(outcome.restoredNote);
        notifyNotesChanged({ type: "upsert", note: outcome.restoredNote });
    }
    if (task.kind.startsWith("category-")) notifyCategoriesChanged();

    return { task, restoredNote: outcome.restoredNote };
}

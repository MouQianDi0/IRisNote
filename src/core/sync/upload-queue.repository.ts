import type {
    ApplicationDatabase,
    ApplicationDatabaseTransaction,
} from "@/core/database";
import { notifyUploadQueueChanged } from "./upload-queue.events";
import type {
    EnqueueUploadTask,
    UploadQueueSummary,
    UploadQueueTask,
    UploadTaskKind,
    UploadTaskStatus,
} from "./upload-queue.types";

type UploadTaskRow = {
    task_id: string;
    owner_user_id: number;
    task_kind: UploadTaskKind;
    dedupe_key: string;
    title: string;
    operation_label: string;
    payload_json: string;
    status: UploadTaskStatus;
    attempt_count: number;
    estimated_bytes: number;
    transferred_bytes: number;
    last_error: string | null;
    created_at: string;
    updated_at: string;
};

const columns = `task_id, owner_user_id, task_kind, dedupe_key, title,
    operation_label, payload_json, status, attempt_count, estimated_bytes,
    transferred_bytes, last_error, created_at, updated_at`;

const makeId = () =>
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const fromRow = (row: UploadTaskRow): UploadQueueTask => ({
    taskId: row.task_id,
    ownerUserId: row.owner_user_id,
    kind: row.task_kind,
    dedupeKey: row.dedupe_key,
    title: row.title,
    operationLabel: row.operation_label,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    status: row.status,
    attemptCount: row.attempt_count,
    estimatedBytes: row.estimated_bytes,
    transferredBytes: row.transferred_bytes,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
});

export async function enqueueUploadTask(
    database: ApplicationDatabase,
    input: EnqueueUploadTask,
) {
    const now = new Date().toISOString();
    await database.run(
        `INSERT INTO upload_queue_tasks (
            task_id, owner_user_id, task_kind, dedupe_key, title,
            operation_label, payload_json, status, attempt_count,
            estimated_bytes, transferred_bytes, last_error, created_at, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 'queued', 0, ?, 0, NULL, ?, ?)
         ON CONFLICT (owner_user_id, dedupe_key) DO UPDATE SET
            task_kind = excluded.task_kind,
            title = excluded.title,
            operation_label = excluded.operation_label,
            payload_json = excluded.payload_json,
            status = 'queued',
            attempt_count = 0,
            estimated_bytes = excluded.estimated_bytes,
            transferred_bytes = 0,
            last_error = NULL,
            updated_at = excluded.updated_at`,
        [
            makeId(),
            input.ownerUserId,
            input.kind,
            input.dedupeKey,
            input.title,
            input.operationLabel,
            JSON.stringify(input.payload),
            Math.max(0, Math.round(input.estimatedBytes)),
            now,
            now,
        ],
    );
    notifyUploadQueueChanged();
}

export async function listUploadTasks(
    database: ApplicationDatabase,
    ownerUserId: number,
) {
    const rows = await database.getAll<UploadTaskRow>(
        `SELECT ${columns} FROM upload_queue_tasks
         WHERE owner_user_id = ? ORDER BY created_at ASC`,
        [ownerUserId],
    );
    return rows.map(fromRow);
}

export async function readUploadQueueSummary(
    database: ApplicationDatabase,
    ownerUserId: number,
): Promise<UploadQueueSummary> {
    const row = await database.getFirst<{
        count: number;
        estimated_bytes: number | null;
        transferred_bytes: number | null;
    }>(
        `SELECT COUNT(*) AS count,
                SUM(estimated_bytes) AS estimated_bytes,
                SUM(transferred_bytes) AS transferred_bytes
         FROM upload_queue_tasks WHERE owner_user_id = ?`,
        [ownerUserId],
    );
    return {
        count: row?.count ?? 0,
        estimatedBytes: row?.estimated_bytes ?? 0,
        transferredBytes: row?.transferred_bytes ?? 0,
    };
}

export async function recoverInterruptedUploadTasks(
    database: ApplicationDatabase,
    ownerUserId: number,
) {
    await database.run(
        `UPDATE upload_queue_tasks SET status = 'queued', updated_at = ?
         WHERE owner_user_id = ? AND status = 'running'`,
        [new Date().toISOString(), ownerUserId],
    );
    notifyUploadQueueChanged();
}

export async function markUploadTaskRunning(
    database: ApplicationDatabase,
    taskId: string,
) {
    const result = await database.run(
        `UPDATE upload_queue_tasks
         SET status = 'running', attempt_count = attempt_count + 1,
             last_error = NULL, updated_at = ?
         WHERE task_id = ? AND status = 'queued'`,
        [new Date().toISOString(), taskId],
    );
    if (result.changes > 0) notifyUploadQueueChanged();
    return result.changes > 0;
}

/**
 * 在同一事务内完成业务回滚与队列删除。
 * queued/paused/blocked 可取消；running 已被协调器认领，禁止并发删除。
 */
export async function cancelUploadTask(
    database: ApplicationDatabase,
    ownerUserId: number,
    taskId: string,
    beforeDelete?: (
        transaction: ApplicationDatabaseTransaction,
        task: UploadQueueTask,
    ) => Promise<void>,
) {
    const task = await database.transaction(async (transaction) => {
        const row = await transaction.getFirst<UploadTaskRow>(
            `SELECT ${columns} FROM upload_queue_tasks
             WHERE owner_user_id = ? AND task_id = ?`,
            [ownerUserId, taskId],
        );
        if (!row) throw new Error("[Upload queue] 暂存任务不存在或已完成");

        const currentTask = fromRow(row);
        if (currentTask.status === "running") {
            throw new Error("[Upload queue] 任务正在上传，暂时无法回滚");
        }

        await beforeDelete?.(transaction, currentTask);
        const result = await transaction.run(
            `DELETE FROM upload_queue_tasks
             WHERE owner_user_id = ? AND task_id = ? AND status <> 'running'`,
            [ownerUserId, taskId],
        );
        if (result.changes !== 1) {
            throw new Error("[Upload queue] 任务状态已变化，请刷新后重试");
        }
        return currentTask;
    });

    notifyUploadQueueChanged();
    return task;
}

export async function markUploadTaskRetry(
    database: ApplicationDatabase,
    taskId: string,
    transferredBytes: number,
    message: string,
) {
    await database.run(
        `UPDATE upload_queue_tasks
         SET status = 'queued', transferred_bytes = transferred_bytes + ?,
             last_error = ?, updated_at = ? WHERE task_id = ?`,
        [Math.max(0, Math.round(transferredBytes)), message, new Date().toISOString(), taskId],
    );
    notifyUploadQueueChanged();
}

export async function pauseUploadTask(
    database: ApplicationDatabase,
    taskId: string,
    status: Extract<UploadTaskStatus, "paused" | "blocked">,
    message: string,
) {
    await database.run(
        `UPDATE upload_queue_tasks SET status = ?, last_error = ?, updated_at = ?
         WHERE task_id = ?`,
        [status, message, new Date().toISOString(), taskId],
    );
    notifyUploadQueueChanged();
}

export async function resumePausedUploadTasks(
    database: ApplicationDatabase,
    ownerUserId: number,
) {
    await database.run(
        `UPDATE upload_queue_tasks
         SET status = 'queued', attempt_count = 0, last_error = NULL, updated_at = ?
         WHERE owner_user_id = ? AND status = 'paused'`,
        [new Date().toISOString(), ownerUserId],
    );
    notifyUploadQueueChanged();
}

export async function completeUploadTask(
    database: ApplicationDatabase,
    taskId: string,
) {
    await database.run("DELETE FROM upload_queue_tasks WHERE task_id = ?", [taskId]);
    notifyUploadQueueChanged();
}

export async function cancelUploadTaskByDedupeKey(
    database: ApplicationDatabase,
    ownerUserId: number,
    dedupeKey: string,
) {
    await database.run(
        "DELETE FROM upload_queue_tasks WHERE owner_user_id = ? AND dedupe_key = ?",
        [ownerUserId, dedupeKey],
    );
    notifyUploadQueueChanged();
}

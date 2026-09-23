import type { ApplicationDatabase } from "@/core/database";
import {
    captureCloudStorageAccess,
    isCloudStoragePermissionError,
    isCloudStorageRequestDispatched,
} from "@/core/cloud-storage/cloud-storage-policy";
import type { UploadQueueTask } from "@/core/sync";
import { deleteNote } from "@/features/notes/api/notes.api";
import {
    createCategory,
    deleteCategory,
    updateCategory,
} from "@/features/notes/categories/api/categories.api";
import { notifyCategoriesChanged } from "@/features/notes/categories/categories.events";
import type { UpdateCategoryPayload } from "@/features/notes/categories/categories.types";
import {
    deleteNoteDraft,
    type DraftCommit,
} from "@/features/notes/data/note-draft.repository";
import {
    getLocalNoteByClientId,
    getLocalNotes,
} from "@/features/notes/data/note-local.repository";
import { readCloudMirror } from "@/features/notes/data/note-sync.repository";
import {
    uploadNoteNow,
    type NoteSaveResult,
} from "@/features/notes/services/note-save.service";
import { isAxiosError } from "axios";

export type UploadTaskExecution = {
    state: "accepted" | "retry" | "blocked" | "suspended";
    message?: string;
    transferredBytes: number;
};

export type UploadTaskAdapter = (
    database: ApplicationDatabase,
    task: UploadQueueTask,
) => Promise<UploadTaskExecution>;

const registeredAdapters = new Map<
    UploadQueueTask["kind"],
    UploadTaskAdapter
>();

/** Future services such as settings sync register their executor once at startup. */
export function registerUploadTaskAdapter(
    kind: UploadQueueTask["kind"],
    adapter: UploadTaskAdapter,
) {
    registeredAdapters.set(kind, adapter);
    return () => {
        if (registeredAdapters.get(kind) === adapter)
            registeredAdapters.delete(kind);
    };
}

const numberValue = (value: unknown, field: string) => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`[Upload queue] ${field} 无效`);
    }
    return value;
};

const stringValue = (value: unknown, field: string) => {
    if (typeof value !== "string" || !value) {
        throw new Error(`[Upload queue] ${field} 无效`);
    }
    return value;
};

const classifyFailure = (
    error: unknown,
    estimatedBytes: number,
    unsafeCreate = false,
): UploadTaskExecution => {
    if (isCloudStoragePermissionError(error)) {
        return {
            state:
                unsafeCreate && isCloudStorageRequestDispatched(error)
                    ? "blocked"
                    : "suspended",
            message:
                unsafeCreate && isCloudStorageRequestDispatched(error)
                    ? "分类创建结果未知，任务已保留，请开启云存储后先检查云端分类，避免重复创建"
                    : "云存储授权已关闭，任务已保留在本机",
            transferredBytes: 0,
        };
    }
    const status = isAxiosError(error) ? error.response?.status : undefined;
    const message = error instanceof Error ? error.message : "上传失败";
    const retryable =
        status == null || status === 408 || status === 429 || status >= 500;
    return {
        state:
            unsafeCreate && status == null
                ? "blocked"
                : retryable
                  ? "retry"
                  : "blocked",
        message,
        transferredBytes: estimatedBytes,
    };
};

async function executeNoteTask(
    database: ApplicationDatabase,
    task: UploadQueueTask,
): Promise<UploadTaskExecution> {
    const checkPermission = captureCloudStorageAccess(task.ownerUserId);
    const clientId = numberValue(task.payload.clientId, "clientId");
    const localNote = await getLocalNoteByClientId(
        database,
        task.ownerUserId,
        clientId,
    );
    if (!localNote) {
        return { state: "accepted", transferredBytes: 0 };
    }
    if (localNote.server_id == null && localNote.sync_status === "unknown") {
        return {
            state: "blocked",
            message: "此前创建请求结果未知，为避免重复笔记，暂不能自动重试",
            transferredBytes: 0,
        };
    }
    let transferredBytes = 0;
    const result: NoteSaveResult =
        localNote.sync_status === "synced"
            ? { note: localNote, cloudState: "accepted" }
            : await uploadNoteNow(
                  database,
                  task.ownerUserId,
                  clientId,
                  (event) => {
                      transferredBytes = Math.max(
                          transferredBytes,
                          event.loaded,
                      );
                  },
              );
    if (result.cloudState !== "accepted") {
        const unknownCreate =
            result.note.server_id == null && result.cloudState === "unknown";
        return {
            state: unknownCreate || !result.retryable ? "blocked" : "retry",
            message: result.message ?? "云端同步未完成",
            transferredBytes: transferredBytes || task.estimatedBytes,
        };
    }

    const draftValue = task.payload.draft;
    checkPermission();
    if (draftValue && typeof draftValue === "object") {
        const draft = draftValue as Partial<DraftCommit>;
        if (
            typeof draft.key === "string" &&
            typeof draft.sessionId === "string" &&
            typeof draft.sequence === "number"
        ) {
            try {
                await deleteNoteDraft(database, task.ownerUserId, {
                    key: draft.key,
                    sessionId: draft.sessionId,
                    sequence: draft.sequence,
                    beforeDelete:
                        draft.removeExplicitFile === true
                            ? async () => {
                                  const { removeExplicitDraft } =
                                      await import("@/features/notes/data/new-note-draft.repository");
                                  await removeExplicitDraft(
                                      task.ownerUserId,
                                      draft.key!,
                                  );
                              }
                            : undefined,
                });
            } catch {
                console.info("[Upload queue] 笔记已同步，草稿由新会话接管", {
                    clientId,
                });
            }
        }
    }
    return {
        state: "accepted",
        transferredBytes: transferredBytes || task.estimatedBytes,
    };
}

async function executeCategoryTask(
    database: ApplicationDatabase,
    task: UploadQueueTask,
): Promise<UploadTaskExecution> {
    const checkPermission = captureCloudStorageAccess(task.ownerUserId);
    let created = false;
    try {
        if (task.kind === "category-create") {
            await createCategory({
                name: stringValue(task.payload.name, "name"),
                ...(typeof task.payload.icon === "string"
                    ? { icon: task.payload.icon }
                    : {}),
            });
            created = true;
        } else if (task.kind === "category-update") {
            const categoryId = numberValue(
                task.payload.categoryId,
                "categoryId",
            );
            const changes = task.payload.changes;
            if (!changes || typeof changes !== "object") {
                throw new Error("[Upload queue] 分类更新内容无效");
            }
            await updateCategory(categoryId, changes as UpdateCategoryPayload);
        } else if (task.kind === "category-delete") {
            const categoryId = numberValue(
                task.payload.categoryId,
                "categoryId",
            );
            const { syncNotes } =
                await import("@/features/notes/services/note-sync-coordinator");
            await syncNotes(database, task.ownerUserId);
            checkPermission();
            const { trashNote } =
                await import("@/features/notes/services/note-trash.service");
            const localNotes = (
                await getLocalNotes(database, task.ownerUserId)
            ).filter((note) => note.category_id === categoryId);
            for (const note of localNotes) {
                checkPermission();
                await trashNote(database, task.ownerUserId, note.id);
            }
            const archivedServerIds = new Set(
                localNotes.map((note) => note.server_id),
            );
            const notes = (
                await readCloudMirror(database, task.ownerUserId)
            ).filter(
                (note) =>
                    note.category_id === categoryId &&
                    !archivedServerIds.has(note.id),
            );
            for (let index = 0; index < notes.length; index += 3) {
                checkPermission();
                await Promise.all(
                    notes
                        .slice(index, index + 3)
                        .map((note) => deleteNote(note.id)),
                );
            }
            checkPermission();
            await deleteCategory(categoryId);
            checkPermission();
            await database.run(
                `INSERT INTO system_preferences(key,value,updated_at) VALUES(?,'true',?)
                ON CONFLICT(key) DO UPDATE SET value='true',updated_at=excluded.updated_at`,
                [
                    `deleted-category:${task.ownerUserId}:${categoryId}`,
                    new Date().toISOString(),
                ],
            );
        }
        // A successful create must be acknowledged even if consent changes immediately
        // afterwards; replaying a non-idempotent create would duplicate the category.
        if (!created) checkPermission();
        notifyCategoriesChanged();
        return { state: "accepted", transferredBytes: task.estimatedBytes };
    } catch (error) {
        return classifyFailure(
            error,
            task.estimatedBytes,
            task.kind === "category-create",
        );
    }
}

export async function executeUploadTask(
    database: ApplicationDatabase,
    task: UploadQueueTask,
) {
    captureCloudStorageAccess(task.ownerUserId)();
    const registered = registeredAdapters.get(task.kind);
    if (registered) return registered(database, task);
    if (task.kind === "note-sync") return executeNoteTask(database, task);
    if (task.kind.startsWith("category-"))
        return executeCategoryTask(database, task);
    return {
        state: "blocked" as const,
        message: `尚未注册 ${task.kind} 上传服务`,
        transferredBytes: 0,
    };
}

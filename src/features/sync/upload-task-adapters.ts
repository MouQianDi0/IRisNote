import type { ApplicationDatabase } from "@/core/database";
import type { UploadQueueTask } from "@/core/sync";
import { deleteNoteDraft, type DraftCommit } from "@/features/notes/data/note-draft.repository";
import { uploadNoteNow } from "@/features/notes/services/note-save.service";
import { getLocalNoteByClientId } from "@/features/notes/data/note-local.repository";
import {
    createCategory,
    deleteCategory,
    updateCategory,
} from "@/features/notes/categories/api/categories.api";
import { isAxiosError } from "axios";
import { deleteNote, getNotes } from "@/features/notes/api/notes.api";
import { notifyCategoriesChanged } from "@/features/notes/categories/categories.events";
import type { UpdateCategoryPayload } from "@/features/notes/categories/categories.types";

export type UploadTaskExecution = {
    state: "accepted" | "retry" | "blocked";
    message?: string;
    transferredBytes: number;
};

export type UploadTaskAdapter = (
    database: ApplicationDatabase,
    task: UploadQueueTask,
) => Promise<UploadTaskExecution>;

const registeredAdapters = new Map<UploadQueueTask["kind"], UploadTaskAdapter>();

/** Future services such as settings sync register their executor once at startup. */
export function registerUploadTaskAdapter(
    kind: UploadQueueTask["kind"],
    adapter: UploadTaskAdapter,
) {
    registeredAdapters.set(kind, adapter);
    return () => {
        if (registeredAdapters.get(kind) === adapter) registeredAdapters.delete(kind);
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
    const status = isAxiosError(error) ? error.response?.status : undefined;
    const message = error instanceof Error ? error.message : "上传失败";
    const retryable =
        status == null || status === 408 || status === 429 || status >= 500;
    return {
        state: unsafeCreate && status == null ? "blocked" : retryable ? "retry" : "blocked",
        message,
        transferredBytes: estimatedBytes,
    };
};

async function executeNoteTask(
    database: ApplicationDatabase,
    task: UploadQueueTask,
): Promise<UploadTaskExecution> {
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
    const result = await uploadNoteNow(database, task.ownerUserId, clientId, (event) => {
        transferredBytes = Math.max(transferredBytes, event.loaded);
    });
    if (result.cloudState !== "accepted") {
        const unknownCreate = result.note.server_id == null && result.cloudState === "unknown";
        return {
            state: unknownCreate || !result.retryable ? "blocked" : "retry",
            message: result.message ?? "云端同步未完成",
            transferredBytes: transferredBytes || task.estimatedBytes,
        };
    }

    const draftValue = task.payload.draft;
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
                    beforeDelete: draft.removeExplicitFile === true ? async () => {
                        const { removeExplicitDraft } = await import("@/features/notes/data/new-note-draft.repository");
                        await removeExplicitDraft(task.ownerUserId, draft.key!);
                    } : undefined,
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

async function executeCategoryTask(task: UploadQueueTask): Promise<UploadTaskExecution> {
    try {
        if (task.kind === "category-create") {
            await createCategory({
                name: stringValue(task.payload.name, "name"),
                ...(typeof task.payload.icon === "string" ? { icon: task.payload.icon } : {}),
            });
        } else if (task.kind === "category-update") {
            const categoryId = numberValue(task.payload.categoryId, "categoryId");
            const changes = task.payload.changes;
            if (!changes || typeof changes !== "object") {
                throw new Error("[Upload queue] 分类更新内容无效");
            }
            await updateCategory(categoryId, changes as UpdateCategoryPayload);
        } else if (task.kind === "category-delete") {
            const categoryId = numberValue(task.payload.categoryId, "categoryId");
            const notes = (await getNotes()).filter((note) => note.category_id === categoryId);
            for (let index = 0; index < notes.length; index += 3) {
                await Promise.all(notes.slice(index, index + 3).map((note) => deleteNote(note.id)));
            }
            await deleteCategory(categoryId);
        }
        notifyCategoriesChanged();
        return { state: "accepted", transferredBytes: task.estimatedBytes };
    } catch (error) {
        return classifyFailure(error, task.estimatedBytes, task.kind === "category-create");
    }
}

export async function executeUploadTask(
    database: ApplicationDatabase,
    task: UploadQueueTask,
) {
    const registered = registeredAdapters.get(task.kind);
    if (registered) return registered(database, task);
    if (task.kind === "note-sync") return executeNoteTask(database, task);
    if (task.kind.startsWith("category-")) return executeCategoryTask(task);
    return {
        state: "blocked" as const,
        message: `尚未注册 ${task.kind} 上传服务`,
        transferredBytes: 0,
    };
}

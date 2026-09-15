import type { ApplicationDatabase } from "@/core/database";
import {
    cancelUploadTaskByDedupeKey,
    enqueueUploadTask,
    estimateJsonBytes,
    listUploadTasks,
} from "@/core/sync";
import type {
    Category,
    CreateCategoryPayload,
    UpdateCategoryPayload,
} from "@/features/notes/categories/categories.types";

export function enqueueCategoryCreate(
    database: ApplicationDatabase,
    ownerUserId: number,
    payload: CreateCategoryPayload,
) {
    return enqueueUploadTask(database, {
        ownerUserId,
        kind: "category-create",
        dedupeKey: `category-create:${payload.name.trim().toLocaleLowerCase()}`,
        title: payload.name.trim(),
        operationLabel: "新建分类",
        payload,
        estimatedBytes: estimateJsonBytes(payload),
    });
}

export async function enqueueCategoryUpdate(
    database: ApplicationDatabase,
    ownerUserId: number,
    category: Category,
    changes: UpdateCategoryPayload,
) {
    const dedupeKey = `category:${category.id}:update`;
    const existing = (await listUploadTasks(database, ownerUserId)).find(
        (task) => task.dedupeKey === dedupeKey,
    );
    const previous = existing?.payload.changes;
    const mergedChanges = {
        ...(previous && typeof previous === "object" ? previous : {}),
        ...changes,
    };
    return enqueueUploadTask(database, {
        ownerUserId,
        kind: "category-update",
        dedupeKey,
        title: typeof changes.name === "string" ? changes.name : category.name,
        operationLabel: "更新分类",
        payload: { categoryId: category.id, changes: mergedChanges },
        estimatedBytes: estimateJsonBytes(mergedChanges),
    });
}

export async function enqueueCategoryDelete(
    database: ApplicationDatabase,
    ownerUserId: number,
    category: Category,
) {
    await cancelUploadTaskByDedupeKey(
        database,
        ownerUserId,
        `category:${category.id}:update`,
    );
    return enqueueUploadTask(database, {
        ownerUserId,
        kind: "category-delete",
        dedupeKey: `category:${category.id}:delete`,
        title: category.name,
        operationLabel: "删除分类",
        payload: { categoryId: category.id },
        estimatedBytes: estimateJsonBytes({ categoryId: category.id }),
    });
}

export async function applyQueuedCategoryChanges(
    database: ApplicationDatabase,
    ownerUserId: number,
    categories: Category[],
) {
    const next = new Map(categories.map((category) => [category.id, category]));
    const tasks = await listUploadTasks(database, ownerUserId);
    for (const task of tasks) {
        if (task.kind === "category-update") {
            const categoryId = task.payload.categoryId;
            const changes = task.payload.changes;
            if (typeof categoryId !== "number" || !changes || typeof changes !== "object") continue;
            const category = next.get(categoryId);
            if (category) next.set(categoryId, { ...category, ...changes });
        } else if (task.kind === "category-delete") {
            if (typeof task.payload.categoryId === "number") next.delete(task.payload.categoryId);
        }
    }
    return [...next.values()];
}

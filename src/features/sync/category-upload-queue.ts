import type { ApplicationDatabase } from "@/core/database";
import { captureLocalStorageAccess } from "@/core/cloud-storage/cloud-storage-policy";
import {
    enqueueUploadTask,
    listUploadTasks,
} from "@/core/sync/upload-queue.repository";
import { estimateJsonBytes } from "@/core/sync/upload-queue.utils";
import {
    importCachedCategories,
    readLocalCategory,
    hasLocalCategories,
    listLocalCategories,
} from "@/features/notes/categories/data/category-local.repository";
import type {
    Category,
    CreateCategoryPayload,
    UpdateCategoryPayload,
} from "@/features/notes/categories/categories.types";

export async function enqueueCategoryCreate(
    database: ApplicationDatabase,
    ownerUserId: number,
    payload: CreateCategoryPayload,
) {
    const check = captureLocalStorageAccess(ownerUserId);
    await database.transaction(async (tx) => {
        check();
        await importCachedCategories(tx, ownerUserId);
        const name = payload.name.trim();
        if (!name || name.length > 10)
            throw new Error("分类名称须为 1–10 个字符");
        const duplicate = await tx.getFirst(
            "SELECT 1 FROM local_categories WHERE owner_user_id=? AND deleted=0 AND lower(name)=lower(?)",
            [ownerUserId, name],
        );
        if (duplicate) throw new Error("已有同名分类");
        const row = await tx.getFirst<{ id: number }>(
            "SELECT MIN(id) AS id FROM local_categories WHERE owner_user_id=?",
            [ownerUserId],
        );
        const id = Math.min(-2, (row?.id ?? -1) - 1);
        const icon = payload.icon ?? "Briefcase";
        await tx.run(
            "INSERT INTO local_categories(owner_user_id,id,name,icon,dirty) VALUES(?,?,?,?,1)",
            [ownerUserId, id, name, icon],
        );
        await enqueueUploadTask(tx, {
            ownerUserId,
            kind: "category-create",
            dedupeKey: `category:${id}`,
            title: name,
            operationLabel: "新建分类",
            payload: { name, icon, localCategoryId: id },
            estimatedBytes: estimateJsonBytes(payload),
        });
        check();
    });
}

export async function enqueueCategoryUpdate(
    database: ApplicationDatabase,
    ownerUserId: number,
    category: Category,
    changes: UpdateCategoryPayload,
) {
    const check = captureLocalStorageAccess(ownerUserId);
    await database.transaction(async (tx) => {
        check();
        await importCachedCategories(tx, ownerUserId);
        const row = await readLocalCategory(tx, ownerUserId, category.id);
        if (!row || row.deleted) throw new Error("分类已不存在，请刷新");
        const next = { ...row, ...changes };
        next.name = next.name.trim();
        if (!next.name || next.name.length > 10)
            throw new Error("分类名称须为 1–10 个字符");
        if (
            await tx.getFirst(
                "SELECT 1 FROM local_categories WHERE owner_user_id=? AND id<>? AND deleted=0 AND lower(name)=lower(?)",
                [ownerUserId, row.id, next.name],
            )
        )
            throw new Error("已有同名分类");
        await tx.run(
            "UPDATE local_categories SET name=?,icon=?,is_pinned=?,is_starred=?,version=version+1,dirty=1 WHERE owner_user_id=? AND id=?",
            [
                next.name,
                next.icon,
                Number(next.is_pinned),
                Number(next.is_starred),
                ownerUserId,
                row.id,
            ],
        );
        await enqueueUploadTask(tx, {
            ownerUserId,
            kind:
                row.server_id === null ? "category-create" : "category-update",
            dedupeKey: `category:${row.id}`,
            title: next.name,
            operationLabel: "更新分类",
            payload: { localCategoryId: row.id },
            estimatedBytes: estimateJsonBytes(changes),
        });
        check();
    });
}

export async function enqueueCategoryDelete(
    database: ApplicationDatabase,
    ownerUserId: number,
    category: Category,
) {
    const check = captureLocalStorageAccess(ownerUserId);
    const { getLocalNotes } =
        await import("@/features/notes/data/note-local.repository");
    const { trashNote } =
        await import("@/features/notes/services/note-trash.service");
    for (const note of await getLocalNotes(database, ownerUserId)) {
        check();
        if (note.category_id === category.id)
            await trashNote(database, ownerUserId, note.id);
    }
    await database.transaction(async (tx) => {
        check();
        await importCachedCategories(tx, ownerUserId);
        const row = await readLocalCategory(tx, ownerUserId, category.id);
        if (!row) throw new Error("分类已不存在");
        await tx.run(
            "UPDATE local_categories SET deleted=1,dirty=1,version=version+1 WHERE owner_user_id=? AND id=?",
            [ownerUserId, row.id],
        );
        await tx.run(
            "INSERT INTO system_preferences(key,value,updated_at) VALUES(?,'true',?) ON CONFLICT(key) DO UPDATE SET value='true',updated_at=excluded.updated_at",
            [
                `deleted-category:${ownerUserId}:${row.id}`,
                new Date().toISOString(),
            ],
        );
        await enqueueUploadTask(tx, {
            ownerUserId,
            kind: "category-delete",
            dedupeKey: `category:${row.id}`,
            title: row.name,
            operationLabel: "删除分类",
            payload: { categoryId: row.id, localCategoryId: row.id },
            estimatedBytes: 0,
        });
        check();
    });
}

export async function applyQueuedCategoryChanges(
    database: ApplicationDatabase,
    ownerUserId: number,
    categories: Category[],
) {
    if (await hasLocalCategories(database))
        categories = await listLocalCategories(database, ownerUserId);
    const next = new Map(categories.map((category) => [category.id, category]));
    const tasks = await listUploadTasks(database, ownerUserId);
    for (const task of tasks) {
        if (task.kind === "category-update") {
            const categoryId = task.payload.categoryId;
            const changes = task.payload.changes;
            if (
                typeof categoryId !== "number" ||
                !changes ||
                typeof changes !== "object"
            )
                continue;
            const category = next.get(categoryId);
            if (category) next.set(categoryId, { ...category, ...changes });
        } else if (task.kind === "category-delete") {
            if (typeof task.payload.categoryId === "number")
                next.delete(task.payload.categoryId);
        }
    }
    return [...next.values()];
}

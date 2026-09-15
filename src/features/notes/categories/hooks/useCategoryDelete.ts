import type { ApplicationDatabase } from "@/core/database";
import { enqueueCategoryDelete } from "@/features/sync";
import type { Category } from "@/features/notes/categories/categories.types";
import { useCallback } from "react";
import { ALL_CATEGORY } from "../categories.constants";
import { notifyCategoriesChanged } from "../categories.events";
import { notifyNotesRemovedByCategory } from "../../notes.events";

export function useCategoryDelete(
    database: ApplicationDatabase,
    ownerUserId: number | null,
    setCategories: React.Dispatch<React.SetStateAction<Category[]>>,
    setLongPressVisible: React.Dispatch<React.SetStateAction<Category | null>>,
    setCategoryModelVisible: React.Dispatch<React.SetStateAction<boolean>>,
    onDeleted?: (category: Category) => void,
) {
    const deleteCategory = useCallback(
        async (category: Category) => {
            if (category.id === ALL_CATEGORY.id) return;
            if (ownerUserId == null) return;

            try {
                await enqueueCategoryDelete(database, ownerUserId, category);
                setCategories((prev) =>
                    prev.filter((c) => c.id !== category.id),
                );
                onDeleted?.(category);
                setCategoryModelVisible(false);
                setLongPressVisible(null);
                notifyCategoriesChanged();
                notifyNotesRemovedByCategory(category.id);
            } catch (err: any) {
                console.error(
                    "删除分类失败:",
                    err.response?.data || err.message,
                );
            }
        },
        [
            setCategories,
            setLongPressVisible,
            setCategoryModelVisible,
            onDeleted,
            database,
            ownerUserId,
        ],
    );

    return { deleteCategory };
}

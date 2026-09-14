import type { ApplicationDatabase } from "@/core/database";
import { enqueueCategoryUpdate } from "@/features/sync";
import type { Category } from "@/features/notes/categories/categories.types";
import { useCallback } from "react";
import { notifyCategoriesChanged } from "../categories.events";

export function useCategoryStar(
    database: ApplicationDatabase,
    ownerUserId: number | null,
    setCategories: React.Dispatch<React.SetStateAction<Category[]>>,
    setLongPressVisible: React.Dispatch<React.SetStateAction<Category | null>>,
) {
    const toggleStar = useCallback(
        (category: Category) => {
            const newStarred = !category.is_starred;
            if (ownerUserId == null) return;
            setCategories((prev) => prev.map((c) => c.id === category.id ? { ...c, is_starred: newStarred } : c));
            setLongPressVisible((prev) => prev ? { ...prev, is_starred: newStarred } : null);
            void enqueueCategoryUpdate(database, ownerUserId, category, { is_starred: newStarred })
                .then(() => {
                    notifyCategoriesChanged();
                })
                .catch((err) => {
                    setCategories((prev) => prev.map((c) => c.id === category.id ? { ...c, is_starred: category.is_starred } : c));
                    setLongPressVisible((prev) => prev ? { ...prev, is_starred: category.is_starred } : null);
                    console.error("切换标星失败:", err.message);
                });
        },
        [database, ownerUserId, setCategories, setLongPressVisible],
    );

    return { toggleStar };
}

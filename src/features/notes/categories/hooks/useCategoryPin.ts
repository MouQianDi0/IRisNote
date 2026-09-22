import type { ApplicationDatabase } from "@/core/database";
import { enqueueCategoryUpdate } from "@/features/sync";
import type { Category } from "@/features/notes/categories/categories.types";
import { useCallback } from "react";
import { notifyCategoriesChanged } from "../categories.events";

export function useCategoryPin(
    database: ApplicationDatabase,
    ownerUserId: number | null,
    setCategories: React.Dispatch<React.SetStateAction<Category[]>>,
    setLongPressVisible: React.Dispatch<React.SetStateAction<Category | null>>,
) {
    const togglePin = useCallback(
        (category: Category) => {
            const newPinned = !category.is_pinned;
            if (ownerUserId == null) return;
            setCategories((prev) =>
                prev.map((c) =>
                    c.id === category.id ? { ...c, is_pinned: newPinned } : c,
                ),
            );
            setLongPressVisible((prev) =>
                prev ? { ...prev, is_pinned: newPinned } : null,
            );
            void enqueueCategoryUpdate(database, ownerUserId, category, {
                is_pinned: newPinned,
            })
                .then(() => {
                    notifyCategoriesChanged();
                })
                .catch((err) => {
                    setCategories((prev) =>
                        prev.map((c) =>
                            c.id === category.id
                                ? { ...c, is_pinned: category.is_pinned }
                                : c,
                        ),
                    );
                    setLongPressVisible((prev) =>
                        prev
                            ? { ...prev, is_pinned: category.is_pinned }
                            : null,
                    );
                    console.error("切换置顶失败:", err.message);
                });
        },
        [database, ownerUserId, setCategories, setLongPressVisible],
    );

    return { togglePin };
}

import { updateCategory } from "@/api/categories";
import { useCallback } from "react";
import type { Category } from "../../data/categories";
import { notifyCategoriesChanged } from "../../data/categories";

export function useCategoryStar(
    setCategories: React.Dispatch<React.SetStateAction<Category[]>>,
    setLongPressVisible: React.Dispatch<React.SetStateAction<Category | null>>,
) {
    const toggleStar = useCallback(
        (category: Category) => {
            const newStarred = !category.is_starred;
            updateCategory(category.id, { is_starred: newStarred })
                .then(() => {
                    setCategories((prev) =>
                        prev.map((c) =>
                            c.id === category.id
                                ? { ...c, is_starred: newStarred }
                                : c,
                        ),
                    );
                    setLongPressVisible((prev) =>
                        prev ? { ...prev, is_starred: newStarred } : null,
                    );
                    notifyCategoriesChanged();
                })
                .catch((err) => {
                    console.error("切换标星失败:", err.message);
                });
        },
        [setCategories, setLongPressVisible],
    );

    return { toggleStar };
}

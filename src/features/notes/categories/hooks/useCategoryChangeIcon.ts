import { updateCategory } from "../api/categories.api";
import type { Category } from "@/features/notes/categories/categories.types";
import { useCallback } from "react";
import { notifyCategoriesChanged } from "../categories.events";

export function useCategoryChangeIcon(
    setCategories: React.Dispatch<React.SetStateAction<Category[]>>,
    setLongPressVisible: React.Dispatch<React.SetStateAction<Category | null>>,
) {
    const changeIcon = useCallback(
        (category: Category, icon: string) => {
            updateCategory(category.id, { icon })
                .then(() => {
                    setCategories((prev) =>
                        prev.map((c) =>
                            c.id === category.id ? { ...c, icon } : c,
                        ),
                    );
                    setLongPressVisible((prev) =>
                        prev ? { ...prev, icon } : null,
                    );
                    notifyCategoriesChanged();
                })
                .catch((err) => {
                    console.error("更换图标失败:", err.message);
                });
        },
        [setCategories, setLongPressVisible],
    );

    return { changeIcon };
}

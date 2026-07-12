import { updateCategory } from "../api/categories.api";
import type { Category } from "@/features/notes/categories/categories.types";
import { useCallback } from "react";
import { notifyCategoriesChanged } from "../categories.events";

export function useCategoryRename(
    setCategories: React.Dispatch<React.SetStateAction<Category[]>>, // 更新分类列表
    setLongPressVisible: React.Dispatch<React.SetStateAction<Category | null>>, // 长按分类时显示的分类信息
) {
    const renameCategory = useCallback(
        (category: Category, newName: string) => {
            updateCategory(category.id, { name: newName })
                .then(() => {
                    setCategories((prev) =>
                        prev.map((c) =>
                            c.id === category.id ? { ...c, name: newName } : c,
                        ),
                    );
                    setLongPressVisible((prev) =>
                        prev ? { ...prev, name: newName } : null,
                    );
                    notifyCategoriesChanged();
                })
                .catch((err) => {
                    console.error("重命名分类失败:", err.message);
                });
        },
        [setCategories, setLongPressVisible],
    );

    return { renameCategory };
}

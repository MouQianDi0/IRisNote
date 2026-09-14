import type { ApplicationDatabase } from "@/core/database";
import { enqueueCategoryUpdate } from "@/features/sync";
import type { Category } from "@/features/notes/categories/categories.types";
import { useCallback } from "react";
import { notifyCategoriesChanged } from "../categories.events";

export function useCategoryRename(
    database: ApplicationDatabase,
    ownerUserId: number | null,
    setCategories: React.Dispatch<React.SetStateAction<Category[]>>, // 更新分类列表
    setLongPressVisible: React.Dispatch<React.SetStateAction<Category | null>>, // 长按分类时显示的分类信息
) {
    const renameCategory = useCallback(
        (category: Category, newName: string) => {
            if (ownerUserId == null) return;
            const previousName = category.name;
            setCategories((prev) =>
                prev.map((c) => c.id === category.id ? { ...c, name: newName } : c),
            );
            setLongPressVisible((prev) => prev ? { ...prev, name: newName } : null);
            void enqueueCategoryUpdate(database, ownerUserId, category, { name: newName })
                .then(() => {
                    notifyCategoriesChanged();
                })
                .catch((err) => {
                    setCategories((prev) => prev.map((c) => c.id === category.id ? { ...c, name: previousName } : c));
                    setLongPressVisible((prev) => prev ? { ...prev, name: previousName } : null);
                    console.error("重命名分类失败:", err.message);
                });
        },
        [database, ownerUserId, setCategories, setLongPressVisible],
    );

    return { renameCategory };
}

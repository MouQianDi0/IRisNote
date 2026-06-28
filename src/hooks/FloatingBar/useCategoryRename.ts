import api from "@/api/client";
import { useCallback } from "react";
import type { Category } from "../../data/categories";

export function useCategoryRename(
    setCategories: React.Dispatch<React.SetStateAction<Category[]>>,
    setLongPressVisible: React.Dispatch<React.SetStateAction<Category | null>>,
) {
    const renameCategory = useCallback(
        (category: Category, newName: string) => {
            api.put(`/categories/${category.id}`, { name: newName })
                .then(() => {
                    setCategories((prev) =>
                        prev.map((c) =>
                            c.id === category.id ? { ...c, name: newName } : c,
                        ),
                    );
                    setLongPressVisible((prev) =>
                        prev ? { ...prev, name: newName } : null,
                    );
                })
                .catch((err) => {
                    console.error("重命名分类失败:", err.message);
                });
        },
        [setCategories, setLongPressVisible],
    );

    return { renameCategory };
}

import api from "@/api/client";
import { useCallback } from "react";
import type { Category } from "../../data/categories";
import { ALL_CATEGORY, notifyCategoriesChanged } from "../../data/categories";

export function useCategoryDelete(
    setCategories: React.Dispatch<React.SetStateAction<Category[]>>,
    setLongPressVisible: React.Dispatch<React.SetStateAction<Category | null>>,
    setCategoryModelVisible: React.Dispatch<React.SetStateAction<boolean>>,
) {
    const deleteCategory = useCallback(
        (category: Category) => {
            if (category.id === ALL_CATEGORY.id) return;
            api.delete(`/categories/${category.id}`)
                .then(() => {
                    setCategories((prev) =>
                        prev.filter((c) => c.id !== category.id),
                    );
                    setCategoryModelVisible(false);
                    setLongPressVisible(null);
                    notifyCategoriesChanged();
                })
                .catch((err) => {
                    console.error("删除分类失败:", err.message);
                });
        },
        [setCategories, setLongPressVisible, setCategoryModelVisible],
    );

    return { deleteCategory };
}

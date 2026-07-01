import api from "@/api/client";
import { useCallback } from "react";
import type { Category } from "../../data/categories";
import { ALL_CATEGORY, notifyCategoriesChanged } from "../../data/categories";

type Note = {
    id: number;
    category_id: number | null;
};

export function useCategoryDelete(
    setCategories: React.Dispatch<React.SetStateAction<Category[]>>,
    setLongPressVisible: React.Dispatch<React.SetStateAction<Category | null>>,
    setCategoryModelVisible: React.Dispatch<React.SetStateAction<boolean>>,
    onDeleted?: (category: Category) => void,
) {
    const deleteCategory = useCallback(
        async (category: Category) => {
            if (category.id === ALL_CATEGORY.id) return;

            try {
                const { data } = await api.get<Note[]>("/notes");
                const notes = Array.isArray(data) ? data : [];
                const categoryNotes = notes.filter(
                    (note) => note.category_id === category.id,
                );

                await Promise.all(
                    categoryNotes.map((note) =>
                        api.delete(`/notes/${note.id}`),
                    ),
                );

                await api.delete(`/categories/${category.id}`);
                setCategories((prev) =>
                    prev.filter((c) => c.id !== category.id),
                );
                onDeleted?.(category);
                setCategoryModelVisible(false);
                setLongPressVisible(null);
                notifyCategoriesChanged();
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
        ],
    );

    return { deleteCategory };
}

import api from "@/api/client";
import { useCallback } from "react";
import type { Category } from "../../data/categories";

export function useCategoryPin(
    setCategories: React.Dispatch<React.SetStateAction<Category[]>>,
    setLongPressVisible: React.Dispatch<React.SetStateAction<Category | null>>,
) {
    const togglePin = useCallback(
        (category: Category) => {
            const newPinned = !category.is_pinned;
            api.put(`/categories/${category.id}`, { is_pinned: newPinned })
                .then(() => {
                    setCategories((prev) =>
                        prev.map((c) =>
                            c.id === category.id
                                ? { ...c, is_pinned: newPinned }
                                : c,
                        ),
                    );
                    setLongPressVisible((prev) =>
                        prev ? { ...prev, is_pinned: newPinned } : null,
                    );
                })
                .catch((err) => {
                    console.error("切换置顶失败:", err.message);
                });
        },
        [setCategories, setLongPressVisible],
    );

    return { togglePin };
}

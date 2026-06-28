import api from "@/api/client";
import { useCallback } from "react";
import type { Category } from "../../data/categories";

export function useCategoryChangeIcon(
    setCategories: React.Dispatch<React.SetStateAction<Category[]>>,
    setLongPressVisible: React.Dispatch<React.SetStateAction<Category | null>>,
) {
    const changeIcon = useCallback(
        (category: Category, icon: string) => {
            api.put(`/categories/${category.id}`, { icon })
                .then(() => {
                    setCategories((prev) =>
                        prev.map((c) =>
                            c.id === category.id ? { ...c, icon } : c,
                        ),
                    );
                    setLongPressVisible((prev) =>
                        prev ? { ...prev, icon } : null,
                    );
                })
                .catch((err) => {
                    console.error("更换图标失败:", err.message);
                });
        },
        [setCategories, setLongPressVisible],
    );

    return { changeIcon };
}

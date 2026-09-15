import type { ApplicationDatabase } from "@/core/database";
import { enqueueCategoryUpdate } from "@/features/sync";
import type { Category } from "@/features/notes/categories/categories.types";
import { useCallback } from "react";
import { notifyCategoriesChanged } from "../categories.events";

export function useCategoryChangeIcon(
    database: ApplicationDatabase,
    ownerUserId: number | null,
    setCategories: React.Dispatch<React.SetStateAction<Category[]>>,
    setLongPressVisible: React.Dispatch<React.SetStateAction<Category | null>>,
) {
    const changeIcon = useCallback(
        (category: Category, icon: string) => {
            if (ownerUserId == null) return;
            const previousIcon = category.icon;
            setCategories((prev) => prev.map((c) => c.id === category.id ? { ...c, icon } : c));
            setLongPressVisible((prev) => prev ? { ...prev, icon } : null);
            void enqueueCategoryUpdate(database, ownerUserId, category, { icon })
                .then(() => {
                    notifyCategoriesChanged();
                })
                .catch((err) => {
                    setCategories((prev) => prev.map((c) => c.id === category.id ? { ...c, icon: previousIcon } : c));
                    setLongPressVisible((prev) => prev ? { ...prev, icon: previousIcon } : null);
                    console.error("更换图标失败:", err.message);
                });
        },
        [database, ownerUserId, setCategories, setLongPressVisible],
    );

    return { changeIcon };
}

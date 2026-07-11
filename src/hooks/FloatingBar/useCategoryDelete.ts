import { deleteCategory as deleteCategoryRequest } from "@/api/categories";
import { deleteNote, getNotes } from "@/api/notes";
import type { Category } from "@/features/notes/categories/categories.types";
import type { Note } from "@/features/notes/notes.types";
import { useCallback } from "react";
import { ALL_CATEGORY, notifyCategoriesChanged } from "../../data/categories";
import { notifyNotesRemovedByCategory } from "../../data/notes";

const DELETE_BATCH_SIZE = 3;
const DELETE_BATCH_DELAY_MS = 100;

const wait = (ms: number) =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

const deleteNotesInBatches = async (
    notes: Pick<Note, "id" | "category_id">[],
) => {
    // TODO: Replace this with a server-side bulk delete endpoint when available.
    for (let index = 0; index < notes.length; index += DELETE_BATCH_SIZE) {
        const batch = notes.slice(index, index + DELETE_BATCH_SIZE);
        await Promise.all(batch.map((note) => deleteNote(note.id)));

        const hasNextBatch = index + DELETE_BATCH_SIZE < notes.length;
        if (hasNextBatch) {
            await wait(DELETE_BATCH_DELAY_MS);
        }
    }
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
                const notes = await getNotes();
                const categoryNotes = notes.filter(
                    (note) => note.category_id === category.id,
                );

                await deleteNotesInBatches(categoryNotes);

                await deleteCategoryRequest(category.id);
                setCategories((prev) =>
                    prev.filter((c) => c.id !== category.id),
                );
                onDeleted?.(category);
                setCategoryModelVisible(false);
                setLongPressVisible(null);
                notifyCategoriesChanged();
                notifyNotesRemovedByCategory(category.id);
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

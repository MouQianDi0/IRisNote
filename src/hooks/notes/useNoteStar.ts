import api from "@/api/client";
import type { SwipeableNote } from "@/components/Note/SwipeableNoteItem";
import { useCallback } from "react";
import { Alert } from "react-native";

type Note = SwipeableNote;

type NotesRef = {
    current: Note[];
};

type UpdateNotesLocally = (
    updater: (prev: Note[]) => Note[],
    shouldSort?: boolean,
) => void;

export function useNoteStar(
    notesRef: NotesRef,
    updateNotesLocally: UpdateNotesLocally,
    setOpenedNoteId: (noteId: number | null) => void,
) {
    const toggleStar = useCallback(
        async (item: Note) => {
            const previousNotes = notesRef.current;
            const nextStarred = !item.is_starred;

            updateNotesLocally((prev) =>
                prev.map((note) =>
                    note.id === item.id
                        ? { ...note, is_starred: nextStarred }
                        : note,
                ),
            );
            setOpenedNoteId(null);

            const payload = { is_starred: nextStarred };
            console.log("笔记标星后端同步开始:", { id: item.id, payload });

            try {
                const { data } = await api.put(`/notes/${item.id}`, payload);
                console.log("笔记标星后端同步成功:", {
                    id: item.id,
                    is_starred: nextStarred,
                    response: data,
                });
            } catch (err: any) {
                console.error("笔记标星后端同步失败:", {
                    id: item.id,
                    status: err.response?.status,
                    data: err.response?.data || err.message,
                });
                updateNotesLocally(() => previousNotes);
                Alert.alert(
                    "提示",
                    err.response?.data?.error ||
                        "同步标星状态失败，已恢复原状态",
                );
            }
        },
        [notesRef, updateNotesLocally, setOpenedNoteId],
    );

    return { toggleStar };
}

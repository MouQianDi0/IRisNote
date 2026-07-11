import { getApiErrorMessage } from "@/api/errors";
import { updateNote } from "@/api/notes";
import type { Note } from "@/features/notes/notes.types";
import { useCallback } from "react";
import { Alert } from "react-native";

type NotesRef = {
    current: Note[];
};

type PinnedOrderRef = {
    current: number;
};

type UpdateNotesLocally = (
    updater: (prev: Note[]) => Note[],
    shouldSort?: boolean,
) => void;

export function useNotePin(
    notesRef: NotesRef,
    pinnedOrderRef: PinnedOrderRef,
    updateNotesLocally: UpdateNotesLocally,
    setOpenedNoteId: (noteId: number | null) => void,
) {
    const togglePin = useCallback(
        async (item: Note) => {
            const previousNotes = notesRef.current;
            const nextPinned = !item.is_pinned;
            const nextPinnedOrder = nextPinned
                ? pinnedOrderRef.current + 1
                : undefined;

            if (nextPinnedOrder != null) {
                pinnedOrderRef.current = nextPinnedOrder;
            }

            updateNotesLocally(
                (prev) =>
                    prev.map((note) =>
                        note.id === item.id
                            ? {
                                  ...note,
                                  is_pinned: nextPinned,
                                  pinned_order: nextPinnedOrder,
                              }
                            : note,
                    ),
                true,
            );
            setOpenedNoteId(null);

            const payload = { is_pinned: nextPinned };
            console.log("笔记置顶后端同步开始:", { id: item.id, payload });

            try {
                const data = await updateNote(item.id, payload);
                console.log("笔记置顶后端同步成功:", {
                    id: item.id,
                    is_pinned: nextPinned,
                    response: data,
                });
            } catch (err: any) {
                console.error("笔记置顶后端同步失败:", {
                    id: item.id,
                    status: err.response?.status,
                    data: err.response?.data || err.message,
                });
                pinnedOrderRef.current = Math.max(
                    0,
                    ...previousNotes.map((note) => note.pinned_order ?? 0),
                );
                updateNotesLocally(() => previousNotes, true);
                Alert.alert(
                    "提示",
                    getApiErrorMessage(err, "同步置顶状态失败，已恢复原状态"),
                );
            }
        },
        [notesRef, pinnedOrderRef, updateNotesLocally, setOpenedNoteId],
    );

    return { togglePin };
}

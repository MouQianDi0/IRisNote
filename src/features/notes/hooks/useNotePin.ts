import { useApplicationDatabase } from "@/core/database";
import { captureNotificationSession } from "@/core/notifications";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { toggleLocalNoteFlag } from "../services/note-flags.service";
import type { Note } from "../notes.types";
import { useCallback } from "react";
import { Alert } from "react-native";

export function useNotePin(
    updateNotesLocally: (
        updater: (prev: Note[]) => Note[],
        shouldSort?: boolean,
    ) => void,
    setOpenedNoteId: (id: number | null) => void,
) {
    const db = useApplicationDatabase();
    const { user } = useAuth();
    const togglePin = useCallback(
        async (item: Note) => {
            if (
                !user ||
                (item.user_id !== undefined && item.user_id !== user.id)
            )
                return;
            const current = captureNotificationSession();
            try {
                const note = await toggleLocalNoteFlag(
                    db,
                    user.id,
                    item.id,
                    "is_pinned",
                );
                if (!current()) return;
                updateNotesLocally(
                    (prev) =>
                        prev.map((value) =>
                            value.id === note.id ? note : value,
                        ),
                    true,
                );
                setOpenedNoteId(null);
            } catch (error) {
                if (current())
                    Alert.alert(
                        "保存失败",
                        error instanceof Error
                            ? error.message
                            : "本机保存失败，请重试",
                    );
            }
        },
        [db, user, updateNotesLocally, setOpenedNoteId],
    );
    return { togglePin };
}

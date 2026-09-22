import { getApiErrorMessage } from "@/shared/http/errors";
import {
    captureCloudStorageAccess,
    isCloudStoragePermissionError,
} from "@/core/cloud-storage/cloud-storage-policy";
import { captureNotificationSession } from "@/core/notifications";
import { updateNote } from "../api/notes.api";
import type { Note } from "@/features/notes/notes.types";
import { useCallback } from "react";
import { Alert } from "react-native";

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
            let checkAccess: () => void;
            try {
                checkAccess = captureCloudStorageAccess(item.user_id);
            } catch (error) {
                Alert.alert(
                    "需要开启云存储",
                    error instanceof Error
                        ? error.message
                        : "请在设置中开启云存储后再操作",
                );
                return;
            }
            const isCurrentSession = captureNotificationSession();
            const serverId = item.server_id ?? (item.id > 0 ? item.id : null);
            if (serverId == null) {
                setOpenedNoteId(null);
                Alert.alert(
                    "提示",
                    "这条笔记尚未获得云端 ID，当前阶段暂不执行标星同步。笔记正文仍已保存在本地。",
                );
                return;
            }

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
            console.log("笔记标星后端同步开始:", { id: serverId, payload });

            try {
                const data = await updateNote(serverId, payload);
                checkAccess();
                console.log("笔记标星后端同步成功:", {
                    id: item.id,
                    is_starred: nextStarred,
                    response: data,
                });
            } catch (err: any) {
                if (!isCurrentSession()) return;
                console.error("笔记标星后端同步失败:", {
                    id: item.id,
                    status: err.response?.status,
                    data: err.response?.data || err.message,
                });
                updateNotesLocally(() => previousNotes);
                Alert.alert(
                    isCloudStoragePermissionError(err)
                        ? "需要开启云存储"
                        : "提示",
                    isCloudStoragePermissionError(err)
                        ? err.message
                        : getApiErrorMessage(
                              err,
                              "同步标星状态失败，已恢复原状态",
                          ),
                );
            }
        },
        [notesRef, updateNotesLocally, setOpenedNoteId],
    );

    return { toggleStar };
}

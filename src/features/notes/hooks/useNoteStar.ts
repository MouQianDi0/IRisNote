import { isAxiosError } from "axios";
import { getApiErrorData, getApiErrorMessage } from "@/shared/http/errors";
import {
    captureCloudStorageAccess,
    isCloudStoragePermissionError,
} from "@/core/cloud-storage/cloud-storage-policy";
import { captureNotificationSession } from "@/core/notifications";
import { updateNote } from "../api/notes.api";
import { createNoteStatusWriter } from "../services/note-status-writer";
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

// 模块级调度器：离开页面后仍发送最后一次切换，界面与缓存已先行更新。
const starWriter = createNoteStatusWriter({
    async send(serverId, isStarred) {
        const payload = { is_starred: isStarred };
        console.log("笔记标星后端同步开始:", { id: serverId, payload });
        const data = await updateNote(serverId, payload);
        console.log("笔记标星后端同步成功:", {
            id: serverId,
            is_starred: isStarred,
            response: data,
        });
    },
});

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

            // 以列表中的最新值为准，避免连续点击时拿到过期的 item。
            const current =
                notesRef.current.find((note) => note.id === item.id) ?? item;
            const previousStarred = Boolean(current.is_starred);
            const nextStarred = !previousStarred;

            updateNotesLocally((prev) =>
                prev.map((note) =>
                    note.id === item.id
                        ? { ...note, is_starred: nextStarred }
                        : note,
                ),
            );
            setOpenedNoteId(null);

            starWriter.request({
                owner: item.user_id,
                noteId: item.id,
                serverId,
                confirmed: previousStarred,
                desired: nextStarred,
                checkAccess,
                isCurrentSession,
                onFailed(confirmed, err) {
                    console.error("笔记标星后端同步失败:", {
                        id: item.id,
                        status: isAxiosError(err)
                            ? err.response?.status
                            : undefined,
                        data:
                            getApiErrorData(err) ??
                            (err instanceof Error ? err.message : err),
                    });
                    // 只回滚这条笔记的标星字段，不覆盖期间其他笔记的变化。
                    updateNotesLocally((prev) =>
                        prev.map((note) =>
                            note.id === item.id
                                ? { ...note, is_starred: confirmed }
                                : note,
                        ),
                    );
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
                },
            });
        },
        [notesRef, updateNotesLocally, setOpenedNoteId],
    );

    return { toggleStar };
}

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

type PinnedOrderRef = {
    current: number;
};

type UpdateNotesLocally = (
    updater: (prev: Note[]) => Note[],
    shouldSort?: boolean,
) => void;

// 模块级调度器：离开页面后仍发送最后一次切换，界面与缓存已先行更新。
const pinWriter = createNoteStatusWriter({
    async send(serverId, isPinned) {
        const payload = { is_pinned: isPinned };
        console.log("笔记置顶后端同步开始:", { id: serverId, payload });
        const data = await updateNote(serverId, payload);
        console.log("笔记置顶后端同步成功:", {
            id: serverId,
            is_pinned: isPinned,
            response: data,
        });
    },
});

export function useNotePin(
    notesRef: NotesRef,
    pinnedOrderRef: PinnedOrderRef,
    updateNotesLocally: UpdateNotesLocally,
    setOpenedNoteId: (noteId: number | null) => void,
) {
    const togglePin = useCallback(
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
                    "这条笔记尚未获得云端 ID，当前阶段暂不执行置顶同步。笔记正文仍已保存在本地。",
                );
                return;
            }

            // 以列表中的最新值为准，避免连续点击时拿到过期的 item。
            const current =
                notesRef.current.find((note) => note.id === item.id) ?? item;
            const previousPinned = Boolean(current.is_pinned);
            const previousPinnedOrder = current.pinned_order;
            const nextPinned = !previousPinned;
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

            pinWriter.request({
                owner: item.user_id,
                noteId: item.id,
                serverId,
                confirmed: previousPinned,
                desired: nextPinned,
                checkAccess,
                isCurrentSession,
                onFailed(confirmed, err) {
                    console.error("笔记置顶后端同步失败:", {
                        id: item.id,
                        status: isAxiosError(err)
                            ? err.response?.status
                            : undefined,
                        data:
                            getApiErrorData(err) ??
                            (err instanceof Error ? err.message : err),
                    });
                    // 只回滚这条笔记的置顶字段；pinnedOrderRef 保持单调递增，不会与其他置顶冲突。
                    updateNotesLocally(
                        (prev) =>
                            prev.map((note) =>
                                note.id === item.id
                                    ? {
                                          ...note,
                                          is_pinned: confirmed,
                                          pinned_order: confirmed
                                              ? previousPinnedOrder
                                              : undefined,
                                      }
                                    : note,
                            ),
                        true,
                    );
                    Alert.alert(
                        isCloudStoragePermissionError(err)
                            ? "需要开启云存储"
                            : "提示",
                        isCloudStoragePermissionError(err)
                            ? err.message
                            : getApiErrorMessage(
                                  err,
                                  "同步置顶状态失败，已恢复原状态",
                              ),
                    );
                },
            });
        },
        [notesRef, pinnedOrderRef, updateNotesLocally, setOpenedNoteId],
    );

    return { togglePin };
}

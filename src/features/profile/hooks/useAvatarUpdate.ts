import { banner, captureNotificationSession } from "@/core/notifications";
import {
    assertCloudStorageAllowed,
    captureCloudStorageAccess,
} from "@/core/cloud-storage/cloud-storage-policy";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useEffect, useRef, useState } from "react";
import { uploadUserAvatar } from "../api/profile.api";
import {
    collectAvatarFromCamera,
    collectAvatarFromLibrary,
} from "../services/avatar-picker.service";
import { writeCachedAvatar } from "../services/avatar-cache";
import {
    base64FromDataUri,
    cacheableAvatarName,
} from "../utils/avatar-cache-key";
import { describeAvatarError } from "../utils/avatar-errors";

/** 关闭弹层后再打开下一层（菜单、预览、系统选图），避免原生窗口切换冲突。 */
const OVERLAY_SWITCH_MS = 300;

export type AvatarSourceKind = "library" | "camera";
export type AvatarMenuAction = "view" | AvatarSourceKind;

export type AvatarPreviewState =
    | { mode: "view" }
    | {
          mode: "pending";
          source: AvatarSourceKind;
          avatar: string;
          uploading: boolean;
          error: string | null;
      };

type PendingPreview = Extract<AvatarPreviewState, { mode: "pending" }>;

/**
 * 更换头像流程：来源菜单 → 系统选图/裁剪 → 预览确认 → 上传 → 以回执更新共享资料。
 * 上传期间预览弹窗保持锁定，直到得到明确结果。
 */
export function useAvatarUpdate() {
    const { user, applyAvatar, syncProfile } = useAuth();
    const [menuVisible, setMenuVisible] = useState(false);
    const [preview, setPreview] = useState<AvatarPreviewState | null>(null);
    const [selecting, setSelecting] = useState(false);
    const menuLockedRef = useRef(false);
    const menuClosingRef = useRef(false);
    const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

    useEffect(() => {
        const timers = timersRef.current;
        return () => {
            timers.forEach(clearTimeout);
            timers.clear();
        };
    }, []);

    const later = (callback: () => void) => {
        const timer = setTimeout(() => {
            timersRef.current.delete(timer);
            callback();
        }, OVERLAY_SWITCH_MS);
        timersRef.current.add(timer);
    };

    const uploading = preview?.mode === "pending" && preview.uploading;
    const busy = selecting || uploading;

    const openMenu = () => {
        if (menuLockedRef.current || busy) return;
        menuLockedRef.current = true;
        menuClosingRef.current = false;
        setMenuVisible(true);
    };

    const closeMenu = () => {
        if (menuClosingRef.current) return;
        menuClosingRef.current = true;
        setMenuVisible(false);
        later(() => {
            menuLockedRef.current = false;
            menuClosingRef.current = false;
        });
    };

    const pick = async (
        source: AvatarSourceKind,
        fallback: PendingPreview | null = null,
    ) => {
        if (!user) return;
        setSelecting(true);
        try {
            assertCloudStorageAllowed(user.id);
            const collected =
                source === "library"
                    ? await collectAvatarFromLibrary()
                    : await collectAvatarFromCamera();
            if (!collected) {
                // 取消选择不提示；重新选择时取消则恢复原先待确认的图片
                if (fallback) setPreview(fallback);
                return;
            }
            setPreview({
                mode: "pending",
                source,
                avatar: collected.avatar,
                uploading: false,
                error: null,
            });
        } catch (error) {
            const { title, message } = describeAvatarError(error);
            banner.show({
                id: "avatar-update",
                type: "important",
                title,
                message,
            });
            if (fallback) setPreview(fallback);
        } finally {
            setSelecting(false);
        }
    };

    const selectAction = (action: AvatarMenuAction) => {
        closeMenu();
        if (action === "view") {
            later(() => setPreview({ mode: "view" }));
            return;
        }
        later(() => void pick(action));
    };

    const rechoose = () => {
        if (preview?.mode !== "pending" || preview.uploading) return;
        const fallback = { ...preview, error: null };
        setPreview(null);
        later(() => void pick(fallback.source, fallback));
    };

    const confirm = async () => {
        if (!user || preview?.mode !== "pending" || preview.uploading) return;
        const userId = user.id;
        const avatar = preview.avatar;
        const isCurrentSession = captureNotificationSession();
        setPreview({ ...preview, uploading: true, error: null });

        let receipt: string;
        try {
            const checkAccess = captureCloudStorageAccess(userId);
            receipt = (await uploadUserAvatar(avatar)).avatar;
            checkAccess();
        } catch (error) {
            setPreview((current) =>
                current?.mode === "pending"
                    ? {
                          ...current,
                          uploading: false,
                          error: describeAvatarError(error).message,
                      }
                    : current,
            );
            return;
        }

        // 服务端已保存：之后的本地写入失败不再视为上传失败，避免诱导重复上传。
        // 先用本地已有的图片数据写入缓存，资料切换到新地址时无需再下载。
        const cacheName = cacheableAvatarName(receipt, userId);
        const base64 = base64FromDataUri(avatar);
        if (cacheName && base64) {
            await writeCachedAvatar(userId, cacheName, base64).catch(
                () => undefined,
            );
        }
        const applied = await applyAvatar(userId, receipt).catch(() => true);
        setPreview(null);
        if (!applied || !isCurrentSession()) return;
        void syncProfile();
        banner.show({
            id: "avatar-update",
            type: "success",
            title: "头像已更新",
        });
    };

    const closePreview = () => {
        if (uploading) return;
        setPreview(null);
    };

    return {
        menuVisible,
        preview,
        busy,
        openMenu,
        closeMenu,
        selectAction,
        rechoose,
        confirm,
        closePreview,
    };
}

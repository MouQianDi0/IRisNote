import { banner, captureNotificationSession } from "@/core/notifications";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import {
    captureCloudStorageAccess,
    isCloudStoragePermissionError,
} from "@/core/cloud-storage/cloud-storage-policy";
import {
    collectAndUploadAvatarFromCamera,
    collectAndUploadAvatarFromLibrary,
} from "@/features/profile/services/avatar-picker.service";
import { normalizeAvatarUrl } from "@/shared/utils/avatar";
import { useState } from "react";
import type { ImageSourcePropType } from "react-native";

export function useAvatar() {
    const { user, syncProfile } = useAuth();
    const { enabled: cloudEnabled, ownerUserId } = useCloudStorage();
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [avatarKey, setAvatarKey] = useState(0);

    const normalizedAvatarUri = normalizeAvatarUrl(user?.avatar);
    const avatarUri =
        normalizedAvatarUri &&
        /^https?:\/\//i.test(normalizedAvatarUri) &&
        (!cloudEnabled || ownerUserId !== user?.id)
            ? undefined
            : normalizedAvatarUri;

    const avatarSource: ImageSourcePropType | undefined = avatarUri
        ? {
              uri: avatarUri.startsWith("data:")
                  ? avatarUri
                  : `${avatarUri}${avatarUri.includes("?") ? "&" : "?"}t=${avatarKey}`,
          }
        : undefined;

    const updateAvatar = async (source: "library" | "camera") => {
        if (!user || avatarUploading) return;

        const isCurrentSession = captureNotificationSession();
        setAvatarUploading(true);
        try {
            const checkAccess = captureCloudStorageAccess(user.id);
            const result =
                source === "library"
                    ? await collectAndUploadAvatarFromLibrary()
                    : await collectAndUploadAvatarFromCamera();

            if (!result) return;

            checkAccess();
            await syncProfile();
            checkAccess();
            setAvatarKey((k) => k + 1);
            if (isCurrentSession()) {
                banner.show({
                    id: "avatar-update",
                    type: "success",
                    title: "头像已更新",
                });
            }
        } catch (err: any) {
            if (isCurrentSession()) {
                const message =
                    err.response?.data?.error ||
                    (err.message === "Media library permission is required."
                        ? "需要相册权限才能选择头像"
                        : err.message === "Camera permission is required."
                          ? "需要相机权限才能拍摄头像"
                          : err.message || "头像更新失败，请稍后再试");
                banner.show({
                    id: "avatar-update",
                    type: "important",
                    title: isCloudStoragePermissionError(err)
                        ? "需要开启云存储"
                        : "头像更新失败",
                    message,
                });
            }
        } finally {
            setAvatarUploading(false);
        }
    };

    return {
        avatarUri,
        avatarSource,
        avatarKey,
        avatarUploading,
        updateAvatar,
    };
}

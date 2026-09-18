import { banner, captureNotificationSession } from "@/core/notifications";
import { useAuth } from "@/features/auth/hooks/useAuth";
import {
    collectAndUploadAvatarFromCamera,
    collectAndUploadAvatarFromLibrary,
} from "@/features/profile/services/avatar-picker.service";
import { normalizeAvatarUrl } from "@/shared/utils/avatar";
import { useState } from "react";
import type { ImageSourcePropType } from "react-native";

export function useAvatar() {
    const { user, syncProfile } = useAuth();
    const [avatarUploading, setAvatarUploading] = useState(false);
    const [avatarKey, setAvatarKey] = useState(0);

    const avatarUri = normalizeAvatarUrl(user?.avatar);

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
            const result =
                source === "library"
                    ? await collectAndUploadAvatarFromLibrary()
                    : await collectAndUploadAvatarFromCamera();

            if (!result) return;

            setAvatarKey((k) => k + 1);
            await syncProfile();
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
                    title: "头像更新失败",
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

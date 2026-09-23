import { useAuth } from "@/features/auth/hooks/useAuth";
import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import { normalizeAvatarUrl } from "@/shared/utils/avatar";
import type { ImageSourcePropType } from "react-native";

/**
 * 当前账号头像的只读展示数据。
 *
 * 服务端每次上传都会返回新的文件名，共享的 user.avatar 变化即可让所有
 * 使用处刷新；更换头像流程见 useAvatarUpdate。
 */
export function useAvatar() {
    const { user } = useAuth();
    const { enabled: cloudEnabled, ownerUserId } = useCloudStorage();

    const normalizedAvatarUri = normalizeAvatarUrl(user?.avatar);
    const avatarUri =
        normalizedAvatarUri &&
        /^https?:\/\//i.test(normalizedAvatarUri) &&
        (!cloudEnabled || ownerUserId !== user?.id)
            ? undefined
            : normalizedAvatarUri;

    const avatarSource: ImageSourcePropType | undefined = avatarUri
        ? { uri: avatarUri }
        : undefined;

    return {
        avatarUri,
        avatarSource,
        avatarKey: avatarUri ?? "none",
    };
}

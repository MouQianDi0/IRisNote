import { useAuth } from "@/features/auth/hooks/useAuth";
import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import { normalizeAvatarUrl } from "@/shared/utils/avatar";
import { useEffect, useSyncExternalStore } from "react";
import type { ImageSourcePropType } from "react-native";
import {
    dropCachedAvatar,
    ensureCachedAvatar,
    getAvatarCacheVersion,
    readCachedAvatar,
    subscribeAvatarCache,
} from "../services/avatar-cache";
import {
    cacheableAvatarName,
    chooseAvatarSource,
} from "../utils/avatar-cache-key";

/**
 * 当前账号头像的展示数据：本地缓存优先（不联网，云存储关闭时也可显示）；
 * 没有缓存且允许联网时显示远程地址并在后台写入本地缓存。
 * 更换头像流程见 useAvatarUpdate。
 */
export function useAvatar() {
    const { user } = useAuth();
    const { enabled: cloudEnabled, ownerUserId } = useCloudStorage();
    useSyncExternalStore(
        subscribeAvatarCache,
        getAvatarCacheVersion,
        getAvatarCacheVersion,
    );

    const userId = user?.id;
    const remoteUri = normalizeAvatarUrl(user?.avatar);
    const cacheName =
        userId !== undefined ? cacheableAvatarName(remoteUri, userId) : null;
    const localUri =
        userId !== undefined && cacheName
            ? readCachedAvatar(userId, cacheName)
            : null;
    const networkAllowed = cloudEnabled && ownerUserId === userId;
    const display = chooseAvatarSource({ localUri, remoteUri, networkAllowed });

    useEffect(() => {
        if (userId === undefined || !cacheName || !remoteUri) return;
        if (localUri || !networkAllowed) return;
        void ensureCachedAvatar(userId, cacheName, remoteUri);
    }, [userId, cacheName, remoteUri, localUri, networkAllowed]);

    const avatarSource: ImageSourcePropType | undefined = display
        ? { uri: display.uri }
        : undefined;

    /** 图片无法显示时调用：本地文件损坏则丢弃缓存，由调用方回退默认图标。 */
    const reportAvatarError = () => {
        if (display?.from === "local" && userId !== undefined && cacheName) {
            dropCachedAvatar(userId, cacheName);
        }
    };

    return {
        avatarUri: display?.uri,
        avatarSource,
        avatarKey: display?.uri ?? "none",
        reportAvatarError,
    };
}

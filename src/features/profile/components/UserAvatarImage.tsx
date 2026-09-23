import { useState, type ReactNode } from "react";
import { Image, type ImageStyle, type StyleProp } from "react-native";
import { useAvatar } from "../hooks/useAvatar";

type UserAvatarImageProps = {
    /** 没有头像或图片加载失败时显示的内容，由调用方保持原有外观。 */
    fallback: ReactNode;
    className?: string;
    style?: StyleProp<ImageStyle>;
};

/** 当前账号头像：本地缓存 → 远程 → 默认图标；加载失败自动回退，不显示空白。 */
export function UserAvatarImage({
    fallback,
    className,
    style,
}: UserAvatarImageProps) {
    const { avatarSource, avatarKey, reportAvatarError } = useAvatar();
    const [failedKey, setFailedKey] = useState<string | null>(null);

    if (!avatarSource || failedKey === avatarKey) return <>{fallback}</>;

    return (
        <Image
            key={avatarKey}
            className={className}
            style={style}
            source={avatarSource}
            onError={() => {
                setFailedKey(avatarKey);
                reportAvatarError();
            }}
        />
    );
}

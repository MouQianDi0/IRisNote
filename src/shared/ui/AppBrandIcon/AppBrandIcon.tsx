import { Image } from "expo-image";
import { useState } from "react";
import localImage from "./brand-image";

const configuredImage = process.env.EXPO_PUBLIC_IMAGE?.trim() ?? "";
const remoteImage = /^https?:\/\//i.test(configuredImage)
    ? { uri: configuredImage }
    : null;
const imageSource = remoteImage ?? localImage;

type AppBrandIconProps = {
    size: number;
    borderRadius?: number;
    accessibilityLabel: string;
};

export function AppBrandIcon({
    size,
    borderRadius = 0,
    accessibilityLabel,
}: AppBrandIconProps) {
    const [remoteFailed, setRemoteFailed] = useState(false);

    return (
        <Image
            accessibilityLabel={accessibilityLabel}
            source={remoteFailed ? localImage : imageSource}
            placeholder={remoteImage ? localImage : undefined}
            placeholderContentFit="contain"
            contentFit="contain"
            onError={
                remoteImage && !remoteFailed
                    ? () => setRemoteFailed(true)
                    : undefined
            }
            style={{ width: size, height: size, borderRadius }}
        />
    );
}

import type * as ImagePicker from "expo-image-picker";
import * as ImagePickerModule from "expo-image-picker";
import type { CollectedAvatar, UploadAvatarResponse } from "../profile.types";
import { uploadUserAvatar } from "../api/profile.api";
import { createAvatarDataUri } from "../utils/avatar";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

const avatarPickerOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    base64: true,
};

export async function collectAvatarFromLibrary(
    options?: ImagePicker.ImagePickerOptions,
): Promise<CollectedAvatar | null> {
    const permission =
        await ImagePickerModule.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
        throw new Error("Media library permission is required.");
    }

    const result = await ImagePickerModule.launchImageLibraryAsync({
        ...avatarPickerOptions,
        ...options,
    });
    return collectAvatarFromResult(result);
}

export async function collectAvatarFromCamera(
    options?: ImagePicker.ImagePickerOptions,
): Promise<CollectedAvatar | null> {
    const permission = await ImagePickerModule.requestCameraPermissionsAsync();
    if (!permission.granted) {
        throw new Error("Camera permission is required.");
    }

    const result = await ImagePickerModule.launchCameraAsync({
        ...avatarPickerOptions,
        ...options,
    });
    return collectAvatarFromResult(result);
}

export async function collectAndUploadAvatarFromLibrary(
    options?: ImagePicker.ImagePickerOptions,
): Promise<UploadAvatarResponse | null> {
    const collectedAvatar = await collectAvatarFromLibrary(options);
    if (!collectedAvatar) return null;
    return uploadUserAvatar(collectedAvatar.avatar);
}

export async function collectAndUploadAvatarFromCamera(
    options?: ImagePicker.ImagePickerOptions,
): Promise<UploadAvatarResponse | null> {
    const collectedAvatar = await collectAvatarFromCamera(options);
    if (!collectedAvatar) return null;
    return uploadUserAvatar(collectedAvatar.avatar);
}

function collectAvatarFromResult(
    result: ImagePicker.ImagePickerResult,
): CollectedAvatar | null {
    if (result.canceled) return null;

    const asset = result.assets[0];
    if (!asset?.base64) {
        throw new Error("Avatar base64 data was not returned.");
    }

    const mimeType = normalizeAvatarMimeType(asset.mimeType);
    const size = asset.fileSize ?? estimateBase64ByteSize(asset.base64);
    if (size > AVATAR_MAX_BYTES) {
        throw new Error("Avatar image must be 2MB or smaller.");
    }

    return {
        avatar: createAvatarDataUri(asset.base64, mimeType),
        asset,
        mimeType,
        size,
    };
}

function normalizeAvatarMimeType(mimeType?: string): string {
    if (
        mimeType === "image/png" ||
        mimeType === "image/gif" ||
        mimeType === "image/webp" ||
        mimeType === "image/jpeg"
    ) {
        return mimeType;
    }
    return "image/jpeg";
}

function estimateBase64ByteSize(base64: string): number {
    const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
    return Math.floor((base64.length * 3) / 4) - padding;
}

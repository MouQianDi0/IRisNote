import api, { API_BASE_URL } from "@/api/client";
import * as ImagePicker from "expo-image-picker";

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
const API_ORIGIN = new URL(API_BASE_URL).origin; // 提取API基础URL的域名部分

console.log(API_ORIGIN);

export type UserProfile = {
    id: number;
    email: string;
    nickname?: string | null;
    avatar?: string | null;
    created_at: string;
};

export type UserProfileResponse = {
    user: UserProfile;
};

export type UploadAvatarResponse = {
    avatar: string;
};

export type CollectedAvatar = {
    avatar: string;
    asset: ImagePicker.ImagePickerAsset;
    mimeType: string;
    size: number;
};

const avatarPickerOptions: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.8,
    base64: true,
};

export async function getUserProfile(): Promise<UserProfile> {
    const { data } = await api.get<UserProfileResponse>("/user/profile");
    return {
        ...data.user,
        avatar: normalizeAvatarUrl(data.user.avatar),
    };
}

export async function uploadUserAvatar(
    avatar: string,
): Promise<UploadAvatarResponse> {
    const { data } = await api.post<UploadAvatarResponse>("/user/avatar", {
        avatar,
    });
    return {
        ...data,
        avatar: normalizeAvatarUrl(data.avatar) || data.avatar,
    };
}

export async function collectAvatarFromLibrary(
    options?: ImagePicker.ImagePickerOptions,
): Promise<CollectedAvatar | null> {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
        throw new Error("Media library permission is required.");
    }

    const result = await ImagePicker.launchImageLibraryAsync({
        ...avatarPickerOptions,
        ...options,
    });

    return collectAvatarFromResult(result);
}

export async function collectAvatarFromCamera(
    options?: ImagePicker.ImagePickerOptions,
): Promise<CollectedAvatar | null> {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
        throw new Error("Camera permission is required.");
    }

    const result = await ImagePicker.launchCameraAsync({
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

export function createAvatarDataUri(
    base64: string,
    mimeType = "image/jpeg",
): string {
    if (base64.startsWith("data:")) return base64;
    return `data:${mimeType};base64,${base64}`;
}

export function normalizeAvatarUrl(avatar?: string | null): string | null {
    if (!avatar) return null;
    if (avatar.startsWith("data:") || avatar.startsWith("file:")) {
        return avatar;
    } // 处理data URI和file URI

    const url = new URL(avatar, API_ORIGIN);
    const segments = url.pathname.split("/").filter(Boolean);
    const filename = segments[segments.length - 1];
    if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
        // 提取文件名，映射到正确的获取头像接口路径
        return new URL(`/api/user/avatar/${filename}`, API_ORIGIN).href;
    }
    return new URL(`/api/user/avatar/${filename}`, API_ORIGIN).href;
}

function collectAvatarFromResult(
    result: ImagePicker.ImagePickerResult,
): CollectedAvatar | null {
    if (result.canceled) return null;

    const asset = result.assets[0];
    if (!asset?.base64) {
        throw new Error("Avatar base64 data was not returned.");
    }

    const mimeType = normalizeAvatarMimeType(asset.mimeType); // 标准化MIME类型
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

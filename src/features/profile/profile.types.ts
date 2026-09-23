import type * as ImagePicker from "expo-image-picker";
import type { UserGender } from "@/shared/types/user";
export type UploadAvatarResponse = {
    avatar: string;
};

export type CollectedAvatar = {
    avatar: string;
    asset: ImagePicker.ImagePickerAsset;
    mimeType: string;
    size: number;
};

export type ProfileChanges = {
    nickname?: string;
    bio?: string | null;
    gender?: UserGender | null;
    region?: { code: string; label: string; version: string } | null;
};

export type UpdateProfilePayload = ProfileChanges & { expected_version: number };

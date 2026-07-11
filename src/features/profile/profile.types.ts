import type * as ImagePicker from "expo-image-picker";
import type { User } from "@/shared/types/user";

export type UserProfileResponse = {
    user: User;
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

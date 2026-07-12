import type * as ImagePicker from "expo-image-picker";
export type UploadAvatarResponse = {
    avatar: string;
};

export type CollectedAvatar = {
    avatar: string;
    asset: ImagePicker.ImagePickerAsset;
    mimeType: string;
    size: number;
};

import api from "@/shared/http/client";
import { normalizeAvatarUrl } from "@/shared/utils/avatar";
import type { UploadAvatarResponse } from "../profile.types";

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

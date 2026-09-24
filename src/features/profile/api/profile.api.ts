import api from "@/shared/http/client";
import { normalizeAvatarUrl } from "@/shared/utils/avatar";
import type { User } from "@/shared/types/user";
import type {
    UpdateProfilePayload,
    UploadAvatarResponse,
} from "../profile.types";

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

/** 条件更新普通资料；409 时响应体附带服务端当前资料。 */
export async function updateUserProfile(
    payload: UpdateProfilePayload,
): Promise<User> {
    const { data } = await api.patch<{ user: User }>("/user/profile", payload, {
        timeout: 15000,
    });
    return {
        ...data.user,
        avatar: normalizeAvatarUrl(data.user.avatar),
    };
}

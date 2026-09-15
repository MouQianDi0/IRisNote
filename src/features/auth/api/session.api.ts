import api from "@/shared/http/client";
import { normalizeAvatarUrl } from "@/shared/utils/avatar";
import type { User } from "@/shared/types/user";
import type { UserProfileResponse } from "../auth.types";

export async function getUserProfile(): Promise<User> {
    const { data } = await api.get<UserProfileResponse>("/user/profile");
    return {
        ...data.user,
        avatar: normalizeAvatarUrl(data.user.avatar),
    };
}

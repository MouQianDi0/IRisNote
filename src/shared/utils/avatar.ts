import { API_BASE_URL } from "@/shared/http/client";

const API_ORIGIN = new URL(API_BASE_URL).origin;

export function normalizeAvatarUrl(avatar?: string | null): string | null {
    if (!avatar) return null;
    if (avatar.startsWith("data:") || avatar.startsWith("file:")) {
        return avatar;
    }

    const url = new URL(avatar, API_ORIGIN);
    const segments = url.pathname.split("/").filter(Boolean);
    const filename = segments[segments.length - 1];
    return new URL(`/api/user/avatar/${filename}`, API_ORIGIN).href;
}

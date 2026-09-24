import api from "@/shared/http/client";
import { normalizeAvatarUrl } from "@/shared/utils/avatar";
import type { User } from "@/shared/types/user";

/** 修改或重设密码成功后服务端吊销其他会话，并为本机签发新令牌。 */
export type PasswordUpdateResponse = { token: string; user: User };

const REQUEST_TIMEOUT = 15000;

async function postPasswordUpdate(
    url: string,
    payload: Record<string, string>,
): Promise<PasswordUpdateResponse> {
    const { data } = await api.post<PasswordUpdateResponse>(url, payload, {
        timeout: REQUEST_TIMEOUT,
    });
    return {
        token: data.token,
        user: { ...data.user, avatar: normalizeAvatarUrl(data.user.avatar) },
    };
}

export function changePassword(
    currentPassword: string,
    newPassword: string,
): Promise<PasswordUpdateResponse> {
    return postPasswordUpdate("/user/password/change", {
        current_password: currentPassword,
        new_password: newPassword,
    });
}

/** 验证码发往当前账号邮箱，收件地址由服务端决定。 */
export async function sendPasswordResetCode(): Promise<void> {
    await api.post("/user/password-reset/send", undefined, {
        timeout: REQUEST_TIMEOUT,
    });
}

export function confirmPasswordReset(
    code: string,
    newPassword: string,
): Promise<PasswordUpdateResponse> {
    return postPasswordUpdate("/user/password-reset/confirm", {
        code,
        new_password: newPassword,
    });
}

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

/** 修改邮箱的一次性凭据：只保存在页面状态中，不写入存储或日志。 */
export type EmailChangeTicket = { ticket: string; expires_in: number };

export async function sendEmailChangeCurrentCode(): Promise<void> {
    await api.post("/user/email-change/send-current", undefined, {
        timeout: REQUEST_TIMEOUT,
    });
}

export async function verifyEmailChangeByCode(
    code: string,
): Promise<EmailChangeTicket> {
    const { data } = await api.post<EmailChangeTicket>(
        "/user/email-change/verify-current",
        { code },
        { timeout: REQUEST_TIMEOUT },
    );
    return data;
}

export async function verifyEmailChangeByPassword(
    password: string,
): Promise<EmailChangeTicket> {
    const { data } = await api.post<EmailChangeTicket>(
        "/user/email-change/verify-password",
        { password },
        { timeout: REQUEST_TIMEOUT },
    );
    return data;
}

export async function sendEmailChangeNewCode(
    ticket: string,
    newEmail: string,
): Promise<void> {
    await api.post(
        "/user/email-change/send-new",
        { ticket, new_email: newEmail },
        { timeout: REQUEST_TIMEOUT },
    );
}

export async function confirmEmailChange(
    ticket: string,
    code: string,
): Promise<User> {
    const { data } = await api.post<{ user: User }>(
        "/user/email-change/confirm",
        { ticket, code },
        { timeout: REQUEST_TIMEOUT },
    );
    return { ...data.user, avatar: normalizeAvatarUrl(data.user.avatar) };
}

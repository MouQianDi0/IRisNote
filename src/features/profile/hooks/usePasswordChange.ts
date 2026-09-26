import { useAuth } from "@/features/auth/hooks/useAuth";
import { useRef, useState } from "react";
import {
    changePassword,
    confirmPasswordReset,
    sendPasswordResetCode,
    type PasswordUpdateResponse,
} from "../api/account-security.api";
import { describePasswordError } from "../utils/password-errors";

export type PasswordSubmitResult =
    /** relogin：新令牌未能保存，本机旧令牌已被吊销，需要用新密码重新登录。 */
    | { status: "saved"; relogin: boolean }
    | { status: "failed"; message: string };

export type SendCodeResult =
    | { status: "sent" }
    | { status: "failed"; message: string; retryAfter?: number };

const UNKNOWN_MESSAGE =
    "网络异常，修改结果未确认。如本机提示登录失效，请用新密码重新登录";

/** 修改密码 / 已登录重设密码：成功后以新令牌替换本机会话，其他设备随之失效。 */
export function usePasswordChange() {
    const { user, applyToken } = useAuth();
    const [submitting, setSubmitting] = useState(false);
    const [sendingCode, setSendingCode] = useState(false);
    const submittingRef = useRef(false);
    const sendingRef = useRef(false);

    const run = async (
        request: () => Promise<PasswordUpdateResponse>,
        fallback: string,
    ): Promise<PasswordSubmitResult> => {
        if (!user) return { status: "failed", message: "登录状态已失效，请重新登录" };
        if (submittingRef.current) return { status: "failed", message: "正在提交，请稍候" };
        submittingRef.current = true;
        setSubmitting(true);
        try {
            const { token, user: updated } = await request();
            const applied = await applyToken(token, updated).catch(() => false);
            return { status: "saved", relogin: !applied };
        } catch (error) {
            return {
                status: "failed",
                message: describePasswordError(error, fallback, UNKNOWN_MESSAGE)
                    .message,
            };
        } finally {
            submittingRef.current = false;
            setSubmitting(false);
        }
    };

    const submitChange = (currentPassword: string, newPassword: string) =>
        run(() => changePassword(currentPassword, newPassword), "修改失败，请稍后再试");

    const submitReset = (code: string, newPassword: string) =>
        run(() => confirmPasswordReset(code, newPassword), "重设失败，请稍后再试");

    const sendCode = async (): Promise<SendCodeResult> => {
        if (sendingRef.current) return { status: "failed", message: "正在发送，请稍候" };
        sendingRef.current = true;
        setSendingCode(true);
        try {
            await sendPasswordResetCode();
            return { status: "sent" };
        } catch (error) {
            const { message, retryAfter } = describePasswordError(
                error,
                "发送失败，请稍后再试",
            );
            return { status: "failed", message, retryAfter };
        } finally {
            sendingRef.current = false;
            setSendingCode(false);
        }
    };

    return { submitChange, submitReset, sendCode, submitting, sendingCode };
}

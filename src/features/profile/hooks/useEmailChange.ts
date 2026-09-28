import { useAuth } from "@/features/auth/hooks/useAuth";
import { useRef, useState } from "react";
import {
    confirmEmailChange,
    sendEmailChangeCurrentCode,
    sendEmailChangeNewCode,
    verifyEmailChangeByCode,
    verifyEmailChangeByPassword,
    type EmailChangeTicket,
} from "../api/account-security.api";
import {
    cloudRequiredMessage,
    describePasswordError,
    isEmailChangeExpired,
} from "../utils/password-errors";
import type { SendCodeResult } from "./usePasswordChange";

export type EmailChangeStep = 1 | 2;
export type IdentityMethod = "code" | "password";

export type EmailChangeResult =
    | { status: "done" }
    /** expired：凭据失效，已退回第 1 步。 */
    | { status: "failed" | "expired"; message: string };

const CLOUD_MESSAGE = cloudRequiredMessage("修改邮箱");
const EXPIRED_MESSAGE = "验证已过期，请重新验证";
const UNKNOWN_MESSAGE = "网络异常，修改结果未确认，已重新读取资料，请核对邮箱";

type HeldTicket = { value: string; expiresAt: number };

/**
 * 修改邮箱：原身份（原邮箱验证码或当前密码）→ 一次性凭据 → 新邮箱验证码 → 原子修改。
 * 凭据只保存在内存引用中，不写入状态存储、路由参数或日志，页面卸载即丢弃。
 */
export function useEmailChange() {
    const { user, applyUser, syncProfile } = useAuth();
    const [step, setStep] = useState<EmailChangeStep>(1);
    const [busy, setBusy] = useState(false);
    const [sendingCode, setSendingCode] = useState(false);
    const ticket = useRef<HeldTicket | null>(null);
    const busyRef = useRef(false);
    const sendingRef = useRef(false);

    const dropTicket = () => {
        ticket.current = null;
        setStep(1);
    };

    /** 本地计时同样视为过期，避免带着必然失败的凭据请求服务端。 */
    const liveTicket = () => {
        const held = ticket.current;
        if (held && Date.now() < held.expiresAt) return held.value;
        dropTicket();
        return null;
    };

    const guarded = async <T,>(
        ref: { current: boolean },
        setFlag: (value: boolean) => void,
        busyMessage: string,
        task: () => Promise<T>,
    ): Promise<T | { status: "failed"; message: string }> => {
        if (ref.current) return { status: "failed", message: busyMessage };
        ref.current = true;
        setFlag(true);
        try {
            return await task();
        } finally {
            ref.current = false;
            setFlag(false);
        }
    };

    const describe = (error: unknown, fallback: string) =>
        describePasswordError(error, fallback, undefined, CLOUD_MESSAGE);

    const sendCode = (
        request: () => Promise<void>,
    ): Promise<SendCodeResult | EmailChangeResult> =>
        guarded(sendingRef, setSendingCode, "正在发送，请稍候", async () => {
            try {
                await request();
                return { status: "sent" as const };
            } catch (error) {
                if (isEmailChangeExpired(error)) {
                    dropTicket();
                    return { status: "expired" as const, message: EXPIRED_MESSAGE };
                }
                const { message, retryAfter } = describe(error, "发送失败，请稍后再试");
                return { status: "failed" as const, message, retryAfter };
            }
        });

    const sendCurrentCode = () => sendCode(sendEmailChangeCurrentCode);

    const sendNewCode = (newEmail: string) => {
        const held = liveTicket();
        if (!held) {
            return Promise.resolve<EmailChangeResult>({
                status: "expired",
                message: EXPIRED_MESSAGE,
            });
        }
        return sendCode(() => sendEmailChangeNewCode(held, newEmail.trim()));
    };

    const verify = (method: IdentityMethod, value: string): Promise<EmailChangeResult> =>
        guarded(busyRef, setBusy, "正在验证，请稍候", async () => {
            try {
                const issued: EmailChangeTicket =
                    method === "code"
                        ? await verifyEmailChangeByCode(value.trim())
                        : await verifyEmailChangeByPassword(value);
                ticket.current = {
                    value: issued.ticket,
                    expiresAt: Date.now() + issued.expires_in * 1000,
                };
                setStep(2);
                return { status: "done" as const };
            } catch (error) {
                return {
                    status: "failed" as const,
                    message: describe(error, "验证失败，请稍后再试").message,
                };
            }
        });

    const confirm = (code: string): Promise<EmailChangeResult> => {
        const held = liveTicket();
        if (!held) {
            return Promise.resolve<EmailChangeResult>({
                status: "expired",
                message: EXPIRED_MESSAGE,
            });
        }
        return guarded(busyRef, setBusy, "正在提交，请稍候", async () => {
            if (!user) {
                return { status: "failed" as const, message: "登录状态已失效，请重新登录" };
            }
            try {
                const updated = await confirmEmailChange(held, code.trim());
                ticket.current = null;
                await applyUser(updated).catch(() => false);
                return { status: "done" as const };
            } catch (error) {
                if (isEmailChangeExpired(error)) {
                    dropTicket();
                    const description = describe(error, EXPIRED_MESSAGE);
                    return { status: "expired" as const, message: description.message };
                }
                const description = describePasswordError(
                    error,
                    "修改失败，请稍后再试",
                    UNKNOWN_MESSAGE,
                    CLOUD_MESSAGE,
                );
                if (description.kind === "unknown") {
                    // 请求可能已生效：先核对最新资料，不宣称成功也不诱导盲目重试
                    await syncProfile().catch(() => undefined);
                }
                return { status: "failed" as const, message: description.message };
            }
        });
    };

    return {
        step,
        busy,
        sendingCode,
        sendCurrentCode,
        verify,
        sendNewCode,
        confirm,
        reset: dropTicket,
    };
}

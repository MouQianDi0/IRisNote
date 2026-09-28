import { AuthField } from "@/features/auth/components/AuthField";
import { AppButton } from "@/shared/ui";
import { useEffect, useRef, useState } from "react";

type VerificationCodeFieldProps = {
    value: string;
    onChangeText: (value: string) => void;
    editable: boolean;
    /** 发送按钮额外的禁用条件（如云存储未开启）。 */
    sendDisabled?: boolean;
    sending: boolean;
    /** 返回需要倒计时的秒数：发送成功为 60，被限流时为服务端要求的等待时间；null 不倒计时。 */
    onSend: () => Promise<number | null>;
};

/** 邮箱验证码输入 + 发送按钮，样式与登录页一致；倒计时以服务端返回的等待时间为准。 */
export function VerificationCodeField({
    value,
    onChangeText,
    editable,
    sendDisabled = false,
    sending,
    onSend,
}: VerificationCodeFieldProps) {
    const [countdown, setCountdown] = useState(0);
    const timer = useRef<ReturnType<typeof setInterval> | null>(null);

    const stop = () => {
        if (timer.current) clearInterval(timer.current);
        timer.current = null;
    };
    useEffect(() => stop, []);

    const send = async () => {
        if (countdown > 0 || sending) return;
        const seconds = await onSend();
        if (!seconds || seconds <= 0) return;
        stop();
        setCountdown(Math.ceil(seconds));
        timer.current = setInterval(() => {
            setCountdown((previous) => {
                if (previous <= 1) {
                    stop();
                    return 0;
                }
                return previous - 1;
            });
        }, 1000);
    };

    return (
        <AuthField
            label="邮箱验证码"
            placeholder="请输入验证码"
            value={value}
            editable={editable}
            onChangeText={onChangeText}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            maxLength={6}
            action={
                <AppButton
                    className="w-[120px]"
                    variant="tonal"
                    label={
                        sending
                            ? "发送中…"
                            : countdown > 0
                              ? `${countdown}s`
                              : "发送验证码"
                    }
                    loading={sending}
                    disabled={sendDisabled || countdown > 0 || !editable}
                    onPress={() => void send()}
                />
            }
        />
    );
}

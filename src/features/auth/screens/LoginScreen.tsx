import { banner } from "@/core/notifications";
import {
    loginWithPassword,
    sendVerificationCode,
} from "@/features/auth/api/auth.api";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useEmailValidation } from "@/features/auth/hooks/useEmailValidation";
import { getApiErrorMessage } from "@/shared/http/errors";
import { storageKeys } from "@/shared/storage/storage.keys";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { AuthButton } from "../components/AuthButton";
import { AppButton } from "@/shared/ui";
import { AuthField } from "../components/AuthField";
import { AuthScreenLayout } from "../components/AuthScreenLayout";

export default function LoginScreen() {
    const { refresh, syncProfile } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [sendingCode, setSendingCode] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const emailCheck = useEmailValidation(email);
    const [formError, setFormError] = useState("");
    const requestRef = useRef(false);
    const codeRequestRef = useRef(false);
    const mountedRef = useRef(true);

    // 倒计时清理
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, []);

    const handleSendCode = async () => {
        if (codeRequestRef.current || requestRef.current || countdown > 0)
            return;
        if (!emailCheck.isValid) {
            setFormError("请先输入有效的邮箱地址");
            return;
        }
        codeRequestRef.current = true;
        setFormError("");
        setSendingCode(true);
        try {
            await sendVerificationCode({
                email: email.trim(),
                type: "login",
            });
            if (!mountedRef.current) return;
            banner.show({ type: "success", title: "验证码已发送，请查收邮件" });
            setCountdown(60);
            countdownRef.current = setInterval(() => {
                setCountdown((prev) => {
                    if (prev <= 1) {
                        if (countdownRef.current)
                            clearInterval(countdownRef.current);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } catch (err: unknown) {
            setFormError(getApiErrorMessage(err, "发送失败，请稍后再试"));
        } finally {
            codeRequestRef.current = false;
            if (mountedRef.current) setSendingCode(false);
        }
    };

    const handleLogin = async () => {
        if (requestRef.current || codeRequestRef.current) return;
        if (!emailCheck.isValid) {
            setFormError(emailCheck.error || "请输入有效邮箱");
            return;
        }
        if (!password.trim()) {
            setFormError("请输入密码");
            return;
        }
        if (!code.trim()) {
            setFormError("请输入邮箱验证码");
            return;
        }

        requestRef.current = true;
        setFormError("");
        setLoading(true);
        try {
            const data = await loginWithPassword({
                email: email.trim(),
                password,
                code: code.trim(),
            });

            // 保存 token 和用户信息
            await AsyncStorage.setItem(storageKeys.authToken, data.token);
            await AsyncStorage.setItem(
                storageKeys.authUser,
                JSON.stringify(data.user),
            );
            await refresh();
            await syncProfile();

            router.replace("/(tabs)/user");
            banner.show({ type: "success", title: "登录成功" });
        } catch (err: unknown) {
            setFormError(getApiErrorMessage(err, "登录失败，请稍后再试"));
        } finally {
            requestRef.current = false;
            if (mountedRef.current) setLoading(false);
        }
    };

    return (
        <AuthScreenLayout
            title="登录"
            subtitle="登录后继续记录你的想法"
            footerPrompt="还没有账号？"
            footerAction="立即注册"
            onFooterPress={() => router.replace("/auth/register")}
            busy={loading || sendingCode}
        >
            <View className="gap-4">
                <AuthField
                    label="邮箱"
                    placeholder="请输入邮箱"
                    value={email}
                    editable={!loading && !sendingCode}
                    onChangeText={(value) => {
                        setEmail(value);
                        setFormError("");
                    }}
                    keyboardType="email-address"
                    autoComplete="email"
                    error={emailCheck.error}
                />
                <AuthField
                    label="邮箱验证码"
                    placeholder="请输入验证码"
                    value={code}
                    editable={!loading}
                    onChangeText={(value) => {
                        setCode(value);
                        setFormError("");
                    }}
                    keyboardType="number-pad"
                    autoComplete="one-time-code"
                    maxLength={6}
                    action={
                        <AppButton
                            className="w-[120px]"
                            variant="tonal"
                            label={
                                sendingCode
                                    ? "发送中…"
                                    : countdown > 0
                                      ? `${countdown}s`
                                      : "发送验证码"
                            }
                            loading={sendingCode}
                            disabled={
                                !emailCheck.isValid || countdown > 0 || loading
                            }
                            onPress={handleSendCode}
                        />
                    }
                />
                <AuthField
                    label="密码"
                    placeholder="请输入密码"
                    password
                    value={password}
                    editable={!loading}
                    onChangeText={(value) => {
                        setPassword(value);
                        setFormError("");
                    }}
                    autoComplete="current-password"
                />
            </View>
            <View className="mt-7">
                {!!formError && (
                    <Text
                        accessibilityRole="alert"
                        className="mb-3 text-sm text-hyper-error"
                    >
                        {formError}
                    </Text>
                )}
                <AuthButton
                    label={loading ? "登录中…" : "登录"}
                    busy={loading}
                    disabled={
                        !emailCheck.isValid ||
                        !password.trim() ||
                        !code.trim() ||
                        sendingCode
                    }
                    onPress={handleLogin}
                />
            </View>
        </AuthScreenLayout>
    );
}

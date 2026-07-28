import { register, sendVerificationCode } from "@/features/auth/api/auth.api";
import { getApiErrorMessage } from "@/shared/http/errors";
import { Button, TextField } from "@/shared/ui";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useEmailValidation } from "@/features/auth/hooks/useEmailValidation";
import { colors } from "@/shared/theme";
import { storageKeys } from "@/shared/storage/storage.keys";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";

export default function RegisterScreen() {
    const { refresh, syncProfile } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [nickname, setNickname] = useState("");
    const [code, setCode] = useState("");
    const [sendingCode, setSendingCode] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const emailCheck = useEmailValidation(email);

    // 倒计时清理
    useEffect(() => {
        return () => {
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, []);

    const handleSendCode = async () => {
        if (!emailCheck.isValid) {
            Alert.alert("提示", "请先输入有效的邮箱地址");
            return;
        }
        setSendingCode(true);
        try {
            await sendVerificationCode({
                email: email.trim(),
                type: "register",
            });
            Alert.alert("提示", "验证码已发送，请查收邮件");
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
            Alert.alert("提示", getApiErrorMessage(err, "发送失败，请稍后再试"));
        } finally {
            setSendingCode(false);
        }
    };

    const handleRegister = async () => {
        if (!emailCheck.isValid) {
            Alert.alert("提示", emailCheck.error || "请输入有效邮箱");
            return;
        }
        if (!nickname.trim()) {
            Alert.alert("提示", "请输入用户名");
            return;
        }
        if (!password.trim() || !confirmPassword.trim()) {
            Alert.alert("提示", "请填写所有字段");
            return;
        }
        if (password !== confirmPassword) {
            Alert.alert("提示", "两次密码不一致");
            return;
        }
        if (password.length < 6) {
            Alert.alert("提示", "密码至少6位");
            return;
        }
        if (!code.trim()) {
            Alert.alert("提示", "请输入邮箱验证码");
            return;
        }

        setLoading(true);
        try {
            const data = await register({
                email: email.trim(),
                password,
                nickname: nickname.trim(),
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

            Alert.alert("成功", "注册成功", [
                { text: "确定", onPress: () => router.replace("/(tabs)/user") },
            ]);
        } catch (err: unknown) {
            Alert.alert("提示", getApiErrorMessage(err, "注册失败，请稍后再试"));
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView
            className="flex-1 bg-white"
            behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
            {/* 表单区域 */}
            <View className="flex-1 px-6 pt-8">
                <Text className="text-sm text-gray-500 mb-2 ml-1">用户名</Text>
                <TextField
                    className="mb-1 border-gray-200"
                    placeholder="请输入用户名"
                    placeholderTextColor={colors.textMuted}
                    value={nickname}
                    onChangeText={setNickname}
                    keyboardType="default"
                    autoCapitalize="none"
                />

                {/* 邮箱 */}
                <Text className="text-sm text-gray-500 mb-2 ml-1">邮箱</Text>
                <TextField
                    className={`mb-1 ${
                        emailCheck.error && email
                            ? "border-red-400"
                            : "border-gray-200"
                    }`}
                    placeholder="请输入邮箱"
                    placeholderTextColor={colors.textMuted}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />
                {emailCheck.error && email ? (
                    <Text className="text-xs text-red-500 mb-1 ml-1">
                        {emailCheck.error}
                    </Text>
                ) : null}

                {/* 验证码 */}
                <Text className="text-sm text-gray-500 mb-2 ml-1">
                    邮箱验证码
                </Text>
                <View className="flex-row items-center mb-5">
                    <TextField
                        className="flex-1 border-gray-200"
                        placeholder="请输入验证码"
                        placeholderTextColor={colors.textMuted}
                        value={code}
                        onChangeText={setCode}
                        keyboardType="number-pad"
                        maxLength={6}
                    />
                    <Button
                        className="ml-3 rounded-xl px-4 py-3.5"
                        variant="primary"
                        onPress={handleSendCode}
                        disabled={
                            !emailCheck.isValid || countdown > 0 || sendingCode
                        }
                    >
                        {sendingCode ? (
                            <ActivityIndicator
                                size="small"
                                color={colors.surface}
                            />
                        ) : (
                            <Text className="text-white text-sm font-semibold whitespace-nowrap">
                                {countdown > 0 ? `${countdown}s` : "发送验证码"}
                            </Text>
                        )}
                    </Button>
                </View>

                {/* 密码 */}
                <Text className="text-sm text-gray-500 mb-2 ml-1">密码</Text>
                <View className="flex-row items-center border border-gray-200 rounded-xl bg-gray-50 mb-5">
                    <TextInput
                        className="flex-1 px-4 py-3.5 text-base"
                        placeholder="至少6位"
                        placeholderTextColor={colors.textMuted}
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                    />
                    <Pressable
                        className="px-3 py-3.5"
                        onPress={() => setShowPassword(!showPassword)}
                    >
                        {showPassword ? (
                            <EyeOff size={20} color={colors.textMuted} />
                        ) : (
                            <Eye size={20} color={colors.textMuted} />
                        )}
                    </Pressable>
                </View>

                {/* 确认密码 */}
                <Text className="text-sm text-gray-500 mb-2 ml-1">
                    确认密码
                </Text>
                <View className="flex-row items-center border border-gray-200 rounded-xl bg-gray-50 mb-2">
                    <TextInput
                        className="flex-1 px-4 py-3.5 text-base"
                        placeholder="再次输入密码"
                        placeholderTextColor={colors.textMuted}
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showConfirm}
                    />
                    <Pressable
                        className="px-3 py-3.5"
                        onPress={() => setShowConfirm(!showConfirm)}
                    >
                        {showConfirm ? (
                            <EyeOff size={20} color={colors.textMuted} />
                        ) : (
                            <Eye size={20} color={colors.textMuted} />
                        )}
                    </Pressable>
                </View>

                {/* 注册按钮 */}
                <Button
                    className="rounded-xl py-3.5 mt-6 flex-row justify-center items-center"
                    variant="primary"
                    onPress={handleRegister}
                    disabled={
                        !emailCheck.isValid ||
                        !nickname.trim() ||
                        !password.trim() ||
                        !confirmPassword.trim() ||
                        !code.trim() ||
                        loading
                    }
                >
                    {loading ? (
                        <ActivityIndicator color={colors.surface} />
                    ) : (
                        <Text className="text-white text-center text-base font-semibold">
                            注册
                        </Text>
                    )}
                </Button>

                {/* 跳转登录 */}
                <View className="flex-row justify-center mt-6">
                    <Text className="text-sm text-gray-500">已有账号？</Text>
                    <Pressable onPress={() => router.back()}>
                        <Text className="text-sm text-primary ml-1">
                            立即登录
                        </Text>
                    </Pressable>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

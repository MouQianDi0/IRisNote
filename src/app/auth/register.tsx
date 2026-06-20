import api from "@/api/client";
import { useAuth } from "@/hooks/useAuth";
import { useEmailValidation } from "@/hooks/useEmailValidation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { Eye, EyeOff } from "lucide-react-native";
import { useState } from "react";
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

export default function Register() {
    const { refresh } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [loading, setLoading] = useState(false);
    const [nickname, setNickname] = useState("");
    const emailCheck = useEmailValidation(email);

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

        setLoading(true);
        try {
            const { data } = await api.post("/auth/register", {
                email: email.trim(),
                password,
                nickname: nickname.trim(),
            }); // 注册

            // 保存 token 和用户信息
            await AsyncStorage.setItem("token", data.token);
            await AsyncStorage.setItem("user", JSON.stringify(data.user));
            await refresh();

            Alert.alert("成功", "注册成功", [
                { text: "确定", onPress: () => router.replace("/(tabs)/user") },
            ]);
        } catch (err: any) {
            const message = err.response?.data?.error || "注册失败，请稍后再试";
            Alert.alert("提示", message);
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
                <TextInput
                    className={
                        "border rounded-xl px-4 py-3.5 text-base mb-1 bg-gray-50 border-gray-200"
                    }
                    placeholder="请输入用户名"
                    placeholderTextColor="#999"
                    value={nickname}
                    onChangeText={setNickname}
                    keyboardType="default"
                    autoCapitalize="none"
                />

                {/* 邮箱 */}
                <Text className="text-sm text-gray-500 mb-2 ml-1">邮箱</Text>
                <TextInput
                    className={`border rounded-xl px-4 py-3.5 text-base mb-1 bg-gray-50 ${
                        emailCheck.error && email
                            ? "border-red-400"
                            : "border-gray-200"
                    }`}
                    placeholder="请输入邮箱"
                    placeholderTextColor="#999"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                />
                {emailCheck.error && email ? (
                    <Text className="text-xs text-red-500 mb-4 ml-1">
                        {emailCheck.error}
                    </Text>
                ) : (
                    <View className="mb-5" />
                )}

                {/* 密码 */}
                <Text className="text-sm text-gray-500 mb-2 ml-1">密码</Text>
                <View className="flex-row items-center border border-gray-200 rounded-xl bg-gray-50 mb-5">
                    <TextInput
                        className="flex-1 px-4 py-3.5 text-base"
                        placeholder="至少6位"
                        placeholderTextColor="#999"
                        value={password}
                        onChangeText={setPassword}
                        secureTextEntry={!showPassword}
                    />
                    <Pressable
                        className="px-3 py-3.5"
                        onPress={() => setShowPassword(!showPassword)}
                    >
                        {showPassword ? (
                            <EyeOff size={20} color="#999" />
                        ) : (
                            <Eye size={20} color="#999" />
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
                        placeholderTextColor="#999"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        secureTextEntry={!showConfirm}
                    />
                    <Pressable
                        className="px-3 py-3.5"
                        onPress={() => setShowConfirm(!showConfirm)}
                    >
                        {showConfirm ? (
                            <EyeOff size={20} color="#999" />
                        ) : (
                            <Eye size={20} color="#999" />
                        )}
                    </Pressable>
                </View>

                {/* 注册按钮 */}
                <Pressable
                    className={`rounded-xl py-3.5 mt-6 flex-row justify-center items-center ${
                        nickname.trim() &&
                        emailCheck.isValid &&
                        password.trim() &&
                        confirmPassword.trim() &&
                        !loading
                            ? "bg-[#007AFF]"
                            : "bg-gray-300"
                    }`}
                    onPress={handleRegister}
                    disabled={
                        !emailCheck.isValid ||
                        !nickname.trim() ||
                        !password.trim() ||
                        !confirmPassword.trim() ||
                        loading
                    }
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text className="text-white text-center text-base font-semibold">
                            注册
                        </Text>
                    )}
                </Pressable>

                {/* 跳转登录 */}
                <View className="flex-row justify-center mt-6">
                    <Text className="text-sm text-gray-500">已有账号？</Text>
                    <Pressable onPress={() => router.back()}>
                        <Text className="text-sm text-[#007AFF] ml-1">
                            立即登录
                        </Text>
                    </Pressable>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

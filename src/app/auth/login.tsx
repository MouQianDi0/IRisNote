import api from "@/api/client";
import { useEmailValidation } from "@/hooks/useEmailValidation";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { ArrowLeft, Eye, EyeOff } from "lucide-react-native";
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

export default function Login() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const emailCheck = useEmailValidation(email);

    const handleLogin = async () => {
        if (!emailCheck.isValid) {
            Alert.alert("提示", emailCheck.error || "请输入有效邮箱");
            return;
        }
        if (!password.trim()) {
            Alert.alert("提示", "请输入密码");
            return;
        }

        setLoading(true);
        try {
            const { data } = await api.post("/auth/login", {
                email: email.trim(),
                password,
            });

            // 保存 token 和用户信息
            await AsyncStorage.setItem("token", data.token);
            await AsyncStorage.setItem("user", JSON.stringify(data.user));

            Alert.alert("成功", "登录成功", [
                { text: "确定", onPress: () => router.replace("/(tabs)/user") },
            ]);
        } catch (err: any) {
            const message = err.response?.data?.error || "登录失败，请稍后再试";
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
            {/* 顶部返回 */}
            <View className="flex-row items-center pt-3 pb-4 px-4">
                <Pressable
                    onPress={() => router.back()}
                    className="w-10 h-10 justify-center items-center"
                >
                    <ArrowLeft size={24} color="#333" />
                </Pressable>
                <Text className="text-lg font-semibold ml-2">登录</Text>
            </View>

            {/* 表单区域 */}
            <View className="flex-1 px-6 pt-8">
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
                <View className="flex-row items-center border border-gray-200 rounded-xl bg-gray-50 mb-2">
                    <TextInput
                        className="flex-1 px-4 py-3.5 text-base"
                        placeholder="请输入密码"
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

                {/* 登录按钮 */}
                <Pressable
                    className={`rounded-xl py-3.5 mt-6 flex-row justify-center items-center ${
                        emailCheck.isValid && password.trim() && !loading
                            ? "bg-[#007AFF]"
                            : "bg-gray-300"
                    }`}
                    onPress={handleLogin}
                    disabled={
                        !emailCheck.isValid || !password.trim() || loading
                    }
                >
                    {loading ? (
                        <ActivityIndicator color="#fff" />
                    ) : (
                        <Text className="text-white text-center text-base font-semibold">
                            登录
                        </Text>
                    )}
                </Pressable>

                {/* 跳转注册 */}
                <View className="flex-row justify-center mt-6">
                    <Text className="text-sm text-gray-500">还没有账号？</Text>
                    <Pressable onPress={() => router.push("/auth/register")}>
                        <Text className="text-sm text-[#007AFF] ml-1">
                            立即注册
                        </Text>
                    </Pressable>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

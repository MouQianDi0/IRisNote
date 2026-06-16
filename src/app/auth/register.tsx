import { useEmailValidation } from "@/hooks/useEmailValidation";
import { router } from "expo-router";
import { ArrowLeft, Eye, EyeOff } from "lucide-react-native";
import { useState } from "react";
import {
    Alert,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    Text,
    TextInput,
    View,
} from "react-native";

export default function Register() {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const emailCheck = useEmailValidation(email);

    const handleRegister = () => {
        if (!emailCheck.isValid) {
            Alert.alert("提示", emailCheck.error || "请输入有效邮箱");
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
        // TODO: 调用后端注册 API
        Alert.alert("提示", "注册功能开发中");
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
                <Text className="text-lg font-semibold ml-2">注册</Text>
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
                    className={`rounded-xl py-3.5 mt-6 ${
                        emailCheck.isValid &&
                        password.trim() &&
                        confirmPassword.trim()
                            ? "bg-[#007AFF]"
                            : "bg-gray-300"
                    }`}
                    onPress={handleRegister}
                    disabled={
                        !emailCheck.isValid ||
                        !password.trim() ||
                        !confirmPassword.trim()
                    }
                >
                    <Text className="text-white text-center text-base font-semibold">
                        注册
                    </Text>
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

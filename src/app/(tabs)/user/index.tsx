import { useAuth } from "@/hooks/useAuth";
import { useAvatar } from "@/hooks/useAvatar";
import { router } from "expo-router";
import {
    ChevronRight,
    LogOut,
    Mail,
    Moon,
    Shield,
    User as UserIcon,
} from "lucide-react-native";
import { Image, Pressable, ScrollView, Text, View } from "react-native";

const MENU_ITEMS = [
    { icon: Moon, label: "深色模式", color: "#7B61FF" },
    { icon: Shield, label: "隐私设置", color: "#34C759" },
    { icon: Mail, label: "意见反馈", color: "#FF9500" },
];

export default function User() {
    const { user, isLoggedIn, logout } = useAuth();
    const { avatarSource, avatarKey, avatarUploading, showAvatarOptions } =
        useAvatar();

    return (
        <View className="flex-1 bg-[#f5f5f5]">
            {/* 头部背景 */}
            <View className="bg-[#007AFF] pt-12 pb-8 px-4 rounded-[32px]">
                {isLoggedIn ? (
                    <View className="items-center">
                        {/* 头像 */}
                        <Pressable
                            className="relative mb-3 h-[80px] w-[80px] items-center justify-center rounded-full border-2 border-white/40 bg-white/20 active:opacity-80"
                            onPress={showAvatarOptions}
                            disabled={avatarUploading}
                            accessibilityLabel="更换头像"
                        >
                            {avatarSource ? (
                                <Image
                                    key={avatarKey}
                                    className="h-full w-full rounded-full"
                                    source={avatarSource}
                                />
                            ) : (
                                <UserIcon size={36} color="#fff" />
                            )}
                        </Pressable>
                        <Text className="text-white text-xl font-bold">
                            {user?.nickname || user?.email?.split("@")[0]}
                        </Text>
                        <Text className="text-white/70 text-sm mt-1">
                            {user?.email}
                        </Text>
                        <Text className="text-white/50 text-xs mt-2">
                            {user
                                ? new Date(user.created_at).toLocaleDateString(
                                      "zh-CN",
                                  )
                                : ""}{" "}
                            加入
                        </Text>
                    </View>
                ) : (
                    <View className="items-center">
                        <View className="w-[80px] h-[80px] rounded-full bg-white/20 justify-center items-center mb-4 border-2 border-white/40">
                            <UserIcon size={36} color="#fff" />
                        </View>
                        <Text className="text-white text-lg font-semibold mb-1">
                            未登录
                        </Text>
                        <Text className="text-white/60 text-sm mb-5">
                            登录后可同步数据到云端
                        </Text>
                        <Pressable
                            className="bg-white rounded-xl px-10 py-3"
                            onPress={() => router.push("/auth/login")}
                        >
                            <Text className="text-[#007AFF] text-base font-semibold">
                                登录 / 注册
                            </Text>
                        </Pressable>
                    </View>
                )}
            </View>

            {/* 菜单列表 */}
            <ScrollView className="flex-1 px-4 pt-6">
                {/* 功能菜单 */}
                <View className="bg-white rounded-2xl overflow-hidden mb-4">
                    {MENU_ITEMS.map((item, index) => (
                        <Pressable
                            key={item.label}
                            className="flex-row items-center px-4 py-[14px] active:bg-gray-50"
                        >
                            <View
                                className="w-9 h-9 rounded-xl justify-center items-center mr-3"
                                style={{ backgroundColor: item.color + "18" }}
                            >
                                <item.icon size={18} color={item.color} />
                            </View>
                            <Text className="flex-1 text-base text-gray-800">
                                {item.label}
                            </Text>
                            <ChevronRight size={18} color="#c0c0c0" />
                        </Pressable>
                    ))}
                </View>

                {/* 退出登录 */}
                {isLoggedIn && (
                    <Pressable
                        className="flex-row items-center justify-center bg-white rounded-2xl py-[14px] mb-4"
                        onPress={logout}
                    >
                        <LogOut size={18} color="#FF3B30" />
                        <Text className="text-[#FF3B30] text-base ml-2">
                            退出登录
                        </Text>
                    </Pressable>
                )}

                {/* 底部留白 */}
                <View className="h-20" />
            </ScrollView>
        </View>
    );
}

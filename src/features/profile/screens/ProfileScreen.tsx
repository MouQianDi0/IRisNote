import { Card, Screen } from "@/shared/ui";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useAvatar } from "@/features/profile/hooks/useAvatar";
import { colors } from "@/shared/theme";
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
    { icon: Moon, label: "深色模式", color: colors.profilePurple },
    { icon: Shield, label: "隐私设置", color: colors.profileGreen },
    { icon: Mail, label: "意见反馈", color: colors.profileOrange },
];

export default function ProfileScreen() {
    const { user, isLoggedIn, logout } = useAuth();
    const { avatarSource, avatarKey, avatarUploading, showAvatarOptions } =
        useAvatar();

    return (
        <Screen className="bg-surface-muted">
            {/* 头部背景 */}
            <View className="bg-primary pt-12 pb-8 px-4 rounded-profile">
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
                                <UserIcon size={36} color={colors.surface} />
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
                            <UserIcon size={36} color={colors.surface} />
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
                            <Text className="text-primary text-base font-semibold">
                                登录 / 注册
                            </Text>
                        </Pressable>
                    </View>
                )}
            </View>

            {/* 菜单列表 */}
            <ScrollView className="flex-1 px-4 pt-6">
                {/* 功能菜单 */}
                <Card className="rounded-2xl overflow-hidden mb-4">
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
                            <ChevronRight
                                size={18}
                                color={colors.profileSilver}
                            />
                        </Pressable>
                    ))}
                </Card>

                {/* 退出登录 */}
                {isLoggedIn && (
                    <Pressable
                        className="flex-row items-center justify-center bg-white rounded-2xl py-[14px] mb-4"
                        onPress={logout}
                    >
                        <LogOut size={18} color={colors.danger} />
                        <Text className="text-danger text-base ml-2">
                            退出登录
                        </Text>
                    </Pressable>
                )}

                {/* 底部留白 */}
                <View className="h-20" />
            </ScrollView>
        </Screen>
    );
}

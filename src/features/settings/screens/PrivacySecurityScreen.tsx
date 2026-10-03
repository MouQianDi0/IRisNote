import { useDebouncedNavigation } from "@/core/navigation/hooks/useDebouncedNavigation";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { maskEmail } from "@/features/profile/utils/profile-validation";
import { colors } from "@/shared/theme";
import { AppButton, Card, ListRow, PageHeader, Screen } from "@/shared/ui";
import { router, type Href } from "expo-router";
import { KeyRound, Mail, ShieldCheck } from "lucide-react-native";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const cardStyle = { borderCurve: "continuous" as const };
const settingsRoute = "/pages/user/settings" as Href;
const welcomeRoute = "/auth/welcome" as Href;
// 保留原路由，兼容既有链接；账户安全入口统一由本页提供。
const passwordRoute = "/pages/user/profile/password" as Href;
const emailRoute = "/pages/user/profile/email" as Href;

export default function PrivacySecurityScreen() {
    const navigate = useDebouncedNavigation();
    const { user, isLoggedIn, loading } = useAuth();
    const insets = useSafeAreaInsets();

    if (loading) {
        return (
            <Screen className="items-center justify-center bg-app-background">
                <ActivityIndicator
                    accessibilityLabel="正在加载隐私与安全"
                    color={colors.primary}
                />
            </Screen>
        );
    }

    if (!isLoggedIn || !user) {
        return (
            <Screen className="bg-app-background">
                <View className="w-full max-w-[560px] flex-1 self-center px-4">
                    <PageHeader
                        title="隐私与安全"
                        backLabel="返回登录与注册"
                        onBack={() => router.replace(welcomeRoute)}
                    />
                    <View className="flex-1 justify-center pb-16">
                        <Card
                            className="items-center rounded-hyper-card p-6"
                            style={cardStyle}
                        >
                            <ShieldCheck size={32} color={colors.primary} />
                            <Text className="mt-4 text-[17px] text-text-primary">
                                尚未登录
                            </Text>
                            <Text className="mt-2 text-center text-sm leading-5 text-hyper-text-secondary">
                                登录后可以管理登录密码与安全邮箱。
                            </Text>
                            <AppButton
                                label="返回登录与注册"
                                className="mt-5 w-full"
                                onPress={() => router.replace(welcomeRoute)}
                            />
                        </Card>
                    </View>
                </View>
            </Screen>
        );
    }

    return (
        <Screen className="bg-app-background">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
                showsVerticalScrollIndicator={false}
            >
                <View className="w-full max-w-[560px] self-center px-4">
                    <PageHeader
                        title="隐私与安全"
                        backLabel="返回设置"
                        onBack={() => router.dismissTo(settingsRoute)}
                    />
                    <View className="mt-4">
                        <Text className="mb-2 ml-1 text-[13px] text-hyper-text-secondary">
                            账户安全
                        </Text>
                        <Card
                            className="overflow-hidden rounded-hyper-card"
                            style={cardStyle}
                        >
                            <ListRow
                                icon={KeyRound}
                                label="修改密码"
                                description="修改登录密码或通过邮箱验证重设"
                                onPress={() => navigate(passwordRoute)}
                            />
                            <ListRow
                                icon={Mail}
                                label="安全邮箱"
                                value={maskEmail(user.email)}
                                description="用于登录与身份验证"
                                onPress={() => navigate(emailRoute)}
                                last
                            />
                        </Card>
                    </View>
                </View>
            </ScrollView>
        </Screen>
    );
}

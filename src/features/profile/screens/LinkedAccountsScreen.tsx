import { useAuth } from "@/features/auth/hooks/useAuth";
import { colors } from "@/shared/theme";
import { Card, ListRow, PageHeader, Screen } from "@/shared/ui";
import { router, type Href } from "expo-router";
import { Link2, UserRound } from "lucide-react-native";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const cardStyle = { borderCurve: "continuous" as const };
const welcomeRoute = "/auth/welcome" as Href;
const personalInfoRoute = "/pages/user/profile" as Href;

/** 平台绑定占位页：首版只做说明，不发起任何授权或绑定请求。 */
export default function LinkedAccountsScreen() {
    const { user, isLoggedIn, loading } = useAuth();
    const insets = useSafeAreaInsets();

    const goBack = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace(personalInfoRoute);
    };

    if (loading) {
        return (
            <Screen className="items-center justify-center bg-app-background">
                <ActivityIndicator
                    accessibilityLabel="正在加载平台绑定"
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
                        title="平台绑定"
                        backLabel="返回登录与注册"
                        onBack={() => router.replace(welcomeRoute)}
                    />
                    <View className="flex-1 justify-center pb-16">
                        <Card
                            className="items-center rounded-hyper-card p-6"
                            style={cardStyle}
                        >
                            <UserRound size={32} color={colors.primary} />
                            <Text className="text-text-primary mt-4 text-[17px]">
                                尚未登录
                            </Text>
                            <Text className="mt-2 text-center text-sm leading-5 text-hyper-text-secondary">
                                登录后可以查看和管理个人资料。
                            </Text>
                            <Pressable
                                accessibilityLabel="返回登录与注册"
                                accessibilityRole="button"
                                className="mt-5 h-12 w-full items-center justify-center rounded-hyper-control bg-primary active:opacity-[0.85]"
                                onPress={() => router.replace(welcomeRoute)}
                            >
                                <Text className="text-[17px] text-white">
                                    返回登录与注册
                                </Text>
                            </Pressable>
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
                        title="平台绑定"
                        backLabel="返回个人资料"
                        onBack={goBack}
                    />

                    <Card
                        accessible
                        accessibilityLabel="关联第三方账户。未来支持将第三方平台账户与 IRisNote 账户关联。目前尚未开放，已有账户仍使用邮箱登录。"
                        className="mt-4 rounded-hyper-card p-4"
                        style={cardStyle}
                    >
                        <View className="flex-row items-center gap-3">
                            <Link2 size={22} color={colors.primary} />
                            <Text className="text-text-primary min-w-0 flex-1 text-[17px]">
                                关联第三方账户
                            </Text>
                        </View>
                        <Text className="ml-[34px] mt-2 text-sm leading-5 text-hyper-text-secondary">
                            未来支持将第三方平台账户与 IRisNote
                            账户关联。目前尚未开放，已有账户仍使用邮箱登录。
                        </Text>
                    </Card>

                    <View className="mt-5">
                        <Text className="mb-2 ml-1 text-[13px] text-hyper-text-secondary">
                            绑定方式
                        </Text>
                        <Card
                            className="overflow-hidden rounded-hyper-card"
                            style={cardStyle}
                        >
                            <ListRow
                                icon={Link2}
                                label="第三方平台绑定"
                                value="敬请期待"
                                disabled
                                last
                            />
                        </Card>
                    </View>
                </View>
            </ScrollView>
        </Screen>
    );
}

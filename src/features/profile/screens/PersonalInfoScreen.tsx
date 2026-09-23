import { banner } from "@/core/notifications";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useAvatar } from "@/features/profile/hooks/useAvatar";
import { colors } from "@/shared/theme";
import { Card, ListRow, PageHeader, Screen } from "@/shared/ui";
import * as Clipboard from "expo-clipboard";
import { router, type Href } from "expo-router";
import {
    CalendarDays,
    Copy,
    FileText,
    Hash,
    KeyRound,
    Link2,
    Mail,
    MapPin,
    UserRound,
    Users,
} from "lucide-react-native";
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const cardStyle = { borderCurve: "continuous" as const };
const welcomeRoute = "/auth/welcome" as Href;
const userTabRoute = "/(tabs)/user" as Href;

/** 规划中的资料项在后端能力接入前统一显示此状态。 */
const PLANNED = "规划中";

function GroupTitle({ children }: { children: string }) {
    return (
        <Text className="mb-2 ml-1 text-[13px] text-hyper-text-secondary">
            {children}
        </Text>
    );
}

/** 保留首字符与域名，其余本地部分用星号代替。 */
export function maskEmail(email: string): string {
    const at = email.lastIndexOf("@");
    if (at <= 0) return email;
    return `${email[0]}***${email.slice(at)}`;
}

/** created_at 转为本地 YYYY-MM-DD；无法解析时返回 null。 */
export function formatJoinedDate(createdAt: string): string | null {
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return null;
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${date.getFullYear()}-${month}-${day}`;
}

export default function PersonalInfoScreen() {
    const { user, isLoggedIn, loading } = useAuth();
    const { avatarSource, avatarKey } = useAvatar();
    const insets = useSafeAreaInsets();

    const goBack = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace(userTabRoute);
    };

    if (loading) {
        return (
            <Screen className="items-center justify-center bg-app-background">
                <ActivityIndicator
                    accessibilityLabel="正在加载个人资料"
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
                        title="个人资料"
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

    const displayName = user.nickname?.trim() || user.email.split("@")[0];
    const maskedEmail = maskEmail(user.email);
    const joinedAt = formatJoinedDate(user.created_at) ?? "暂不可用";
    const userId = String(user.id);

    const copyUserId = async () => {
        try {
            await Clipboard.setStringAsync(userId);
            banner.show({ title: "用户 ID 已复制", type: "success" });
        } catch {
            banner.show({ title: "复制失败，请稍后重试", type: "neutral" });
        }
    };

    return (
        <Screen className="bg-app-background">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
                showsVerticalScrollIndicator={false}
            >
                <View className="w-full max-w-[560px] self-center px-4">
                    <PageHeader
                        title="个人资料"
                        backLabel="返回上一页"
                        onBack={goBack}
                    />

                    <Card
                        accessible
                        accessibilityLabel={`${displayName}，${maskedEmail}`}
                        className="mt-4 flex-row items-center rounded-hyper-card p-4"
                        style={cardStyle}
                    >
                        <View className="h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-hyper-card-selected">
                            {avatarSource ? (
                                <Image
                                    key={avatarKey}
                                    className="h-full w-full rounded-full"
                                    source={avatarSource}
                                />
                            ) : (
                                <UserRound size={30} color={colors.primary} />
                            )}
                        </View>
                        <View className="ml-[14px] min-w-0 flex-1">
                            <Text
                                className="text-text-primary text-xl"
                                numberOfLines={1}
                            >
                                {displayName}
                            </Text>
                            <Text
                                className="mt-1 text-[13px] text-hyper-text-secondary"
                                numberOfLines={1}
                            >
                                {maskedEmail}
                            </Text>
                        </View>
                    </Card>

                    <View className="mt-5">
                        <GroupTitle>基本资料</GroupTitle>
                        <Card
                            className="overflow-hidden rounded-hyper-card"
                            style={cardStyle}
                        >
                            <ListRow
                                icon={UserRound}
                                label="用户名"
                                value={displayName}
                            />
                            <ListRow
                                icon={Users}
                                label="性别"
                                value={PLANNED}
                                disabled
                            />
                            <ListRow
                                icon={MapPin}
                                label="地区"
                                value={PLANNED}
                                disabled
                            />
                            <ListRow
                                icon={FileText}
                                label="个人简介"
                                value={PLANNED}
                                disabled
                                last
                            />
                        </Card>
                    </View>

                    <View className="mt-5">
                        <GroupTitle>账户与安全</GroupTitle>
                        <Card
                            className="overflow-hidden rounded-hyper-card"
                            style={cardStyle}
                        >
                            <ListRow
                                icon={Mail}
                                label="邮箱"
                                value={maskedEmail}
                            />
                            <ListRow
                                icon={KeyRound}
                                label="修改密码"
                                value={PLANNED}
                                disabled
                            />
                            <ListRow
                                icon={Link2}
                                label="平台绑定"
                                value="敬请期待"
                                disabled
                                last
                            />
                        </Card>
                    </View>

                    <View className="mt-5">
                        <GroupTitle>账户信息</GroupTitle>
                        <Card
                            className="overflow-hidden rounded-hyper-card"
                            style={cardStyle}
                        >
                            <ListRow
                                icon={Hash}
                                label="用户 ID"
                                value={userId}
                                trailing={
                                    <Pressable
                                        accessibilityLabel="复制用户 ID"
                                        accessibilityRole="button"
                                        className="-my-3 h-11 w-11 items-center justify-center rounded-full active:bg-hyper-card active:opacity-[0.85]"
                                        onPress={() => void copyUserId()}
                                    >
                                        <Copy
                                            size={18}
                                            color={colors.primary}
                                        />
                                    </Pressable>
                                }
                            />
                            <ListRow
                                icon={CalendarDays}
                                label="注册时间"
                                value={joinedAt}
                                last
                            />
                        </Card>
                    </View>
                </View>
            </ScrollView>
        </Screen>
    );
}

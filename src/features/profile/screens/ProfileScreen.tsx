import { useAuth } from "@/features/auth/hooks/useAuth";
import { useAvatar } from "@/features/profile/hooks/useAvatar";
import { useProfileOverview } from "@/features/profile/hooks/useProfileOverview";
import { colors } from "@/shared/theme";
import { Card, Screen } from "@/shared/ui";
import { router, type Href } from "expo-router";
import {
    Archive,
    BookOpenText,
    ChevronRight,
    FileText,
    Folder,
    Star,
    Trash2,
    User as UserIcon,
    type LucideIcon,
} from "lucide-react-native";
import { useEffect } from "react";
import {
    ActivityIndicator,
    Image,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";

const cardStyle = { borderCurve: "continuous" as const };

const personalInfoRoute = "/pages/user/profile" as Href;

function SectionTitle({ children }: { children: string }) {
    return (
        <Text className="mb-2 ml-1 text-[13px] text-hyper-text-secondary">
            {children}
        </Text>
    );
}

function OverviewMetric({
    icon: Icon,
    label,
    value,
    loading,
}: {
    icon: LucideIcon;
    label: string;
    value: number | null;
    loading: boolean;
}) {
    return (
        <View
            accessible
            accessibilityLabel={`${label}，${value ?? "暂不可用"}`}
            className="min-w-0 flex-1 items-center px-1 py-1"
        >
            <View className="h-6 w-6 items-center justify-center">
                <Icon size={22} color={colors.primary} />
            </View>
            <View className="mt-2 h-6 items-center justify-center">
                {loading ? (
                    <ActivityIndicator color={colors.primary} size="small" />
                ) : (
                    <Text className="text-text-primary text-[17px]">
                        {value ?? "—"}
                    </Text>
                )}
            </View>
            <Text className="mt-1 text-[13px] text-hyper-text-secondary">
                {label}
            </Text>
        </View>
    );
}

function ContentRow({
    icon: Icon,
    label,
    value,
    last = false,
    onPress,
}: {
    icon: LucideIcon;
    label: string;
    value?: string;
    last?: boolean;
    onPress: () => void;
}) {
    return (
        <>
            <Pressable
                accessibilityLabel={[label, value].filter(Boolean).join("，")}
                accessibilityRole="button"
                className="min-h-14 flex-row items-center gap-3 px-4 py-3 active:bg-surface-muted active:opacity-[0.85]"
                onPress={onPress}
            >
                <View className="h-6 w-6 items-center justify-center">
                    <Icon size={22} color={colors.primary} />
                </View>
                <Text className="text-text-primary min-w-0 flex-1 text-[17px]">
                    {label}
                </Text>
                {value ? (
                    <Text className="text-[13px] text-hyper-text-secondary">
                        {value}
                    </Text>
                ) : null}
                <ChevronRight size={18} color={colors.textMuted} />
            </Pressable>
            {!last ? <View className="mx-4 h-px bg-hyper-divider" /> : null}
        </>
    );
}

export default function ProfileScreen() {
    const { user, isLoggedIn, loading: authLoading } = useAuth();
    const { avatarSource, avatarKey } = useAvatar();
    const { overview, loading: overviewLoading } = useProfileOverview(user?.id);

    useEffect(() => {
        const mountedAt = Date.now();
        console.info(
            "[IRisNoteCrashTrace]",
            JSON.stringify({
                scope: "profile",
                stage: "mounted",
                timestamp: mountedAt,
            }),
        );
        return () => {
            console.info(
                "[IRisNoteCrashTrace]",
                JSON.stringify({
                    scope: "profile",
                    stage: "unmounted",
                    timestamp: Date.now(),
                    elapsedMs: Date.now() - mountedAt,
                }),
            );
        };
    }, []);

    if (authLoading) {
        return (
            <Screen className="items-center justify-center bg-app-background">
                <ActivityIndicator
                    accessibilityLabel="正在加载用户信息"
                    color={colors.primary}
                />
            </Screen>
        );
    }

    if (!isLoggedIn || !user) {
        return (
            <Screen className="bg-app-background">
                <View className="w-full flex-1 justify-center px-4 py-4">
                    <Card
                        className="items-center rounded-hyper-card p-6"
                        style={cardStyle}
                    >
                        <UserIcon size={32} color={colors.primary} />
                        <Text className="text-text-primary mt-4 text-[17px]">
                            尚未登录
                        </Text>
                        <Text className="mt-2 text-center text-sm leading-5 text-hyper-text-secondary">
                            登录后可以查看个人内容与阅读进度。
                        </Text>
                        <Pressable
                            accessibilityLabel="前往登录与注册"
                            accessibilityRole="button"
                            className="mt-5 h-12 w-full items-center justify-center rounded-hyper-control bg-primary active:opacity-[0.85]"
                            onPress={() => router.replace("/auth/welcome")}
                        >
                            <Text className="text-[17px] text-white">
                                登录 / 注册
                            </Text>
                        </Pressable>
                    </Card>
                </View>
            </Screen>
        );
    }

    const displayName = user.nickname?.trim() || user.email.split("@")[0];
    const joinedAt = new Date(user.created_at).toLocaleDateString("zh-CN");
    const openNotes = (view?: "starred", drafts?: boolean) => {
        router.push(
            drafts
                ? "/pages/user/drafts"
                : view === "starred"
                  ? "/pages/user/starred"
                  : "/pages/user/notes",
        );
    };

    return (
        <Screen className="bg-app-background">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ flexGrow: 1 }}
                showsVerticalScrollIndicator={false}
            >
                <View
                    className="w-full gap-5 px-4 py-4"
                    style={{ flexGrow: 1 }}
                >
                    <View>
                        <Pressable
                            accessibilityLabel={`${displayName}，${user.email}，查看个人资料`}
                            accessibilityRole="button"
                            className="min-h-24 flex-row items-center rounded-hyper-card bg-white p-4 active:opacity-[0.85]"
                            onPress={() => router.push(personalInfoRoute)}
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
                                    <UserIcon
                                        size={30}
                                        color={colors.primary}
                                    />
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
                                    {user.email}
                                </Text>
                                <Text
                                    className="mt-1 text-[13px] text-hyper-text-secondary"
                                    numberOfLines={1}
                                >
                                    {joinedAt} 加入
                                </Text>
                            </View>
                            <View className="ml-2">
                                <ChevronRight
                                    size={18}
                                    color={colors.textMuted}
                                />
                            </View>
                        </Pressable>

                        <Card
                            accessible
                            accessibilityLabel="个人内容概览"
                            className="mt-4 min-h-28 flex-row rounded-hyper-card px-2 py-3"
                            style={cardStyle}
                        >
                            <OverviewMetric
                                icon={FileText}
                                label="笔记"
                                loading={overviewLoading}
                                value={overview.noteCount}
                            />
                            <View className="my-3 w-px bg-hyper-divider" />
                            <OverviewMetric
                                icon={Folder}
                                label="分类"
                                loading={overviewLoading}
                                value={overview.categoryCount}
                            />
                            <View className="my-3 w-px bg-hyper-divider" />
                            <OverviewMetric
                                icon={Star}
                                label="标星"
                                loading={overviewLoading}
                                value={overview.starredCount}
                            />
                        </Card>
                    </View>

                    <View>
                        <SectionTitle>继续阅读</SectionTitle>
                        {overview.continueReading ? (
                            <Pressable
                                accessibilityLabel={`继续阅读${overview.continueReading.title}，已读${overview.continueReading.percent}%`}
                                accessibilityRole="button"
                                className="min-h-[120px] rounded-hyper-card bg-white p-4 active:opacity-[0.85]"
                                onPress={() =>
                                    router.push({
                                        pathname: "/pages/note/[id]",
                                        params: {
                                            id: String(
                                                overview.continueReading
                                                    ?.noteId,
                                            ),
                                        },
                                    })
                                }
                                style={cardStyle}
                            >
                                <View className="flex-row items-center">
                                    <View className="h-[26px] w-[26px] items-center justify-center">
                                        <BookOpenText
                                            size={22}
                                            color={colors.primary}
                                        />
                                    </View>
                                    <Text
                                        className="text-text-primary ml-3 min-w-0 flex-1 text-[17px]"
                                        numberOfLines={1}
                                    >
                                        {overview.continueReading.title}
                                    </Text>
                                    <ChevronRight
                                        size={18}
                                        color={colors.textMuted}
                                    />
                                </View>
                                <View className="mt-4 h-1.5 overflow-hidden rounded-full bg-hyper-card">
                                    <View
                                        className="h-full rounded-full bg-primary"
                                        style={{
                                            width: `${overview.continueReading.percent}%`,
                                        }}
                                    />
                                </View>
                                <Text className="mt-2 text-[13px] text-hyper-text-secondary">
                                    已阅读 {overview.continueReading.percent}%
                                </Text>
                            </Pressable>
                        ) : (
                            <Pressable
                                accessibilityLabel="还没有阅读记录，去看看笔记"
                                accessibilityRole="button"
                                className="min-h-[120px] items-center rounded-hyper-card bg-white px-4 py-5 active:opacity-[0.85]"
                                onPress={() => openNotes()}
                                style={cardStyle}
                            >
                                <View className="h-[26px] w-[26px] items-center justify-center">
                                    {overviewLoading ? (
                                        <ActivityIndicator
                                            accessibilityLabel="正在加载阅读记录"
                                            color={colors.primary}
                                        />
                                    ) : (
                                        <BookOpenText
                                            size={26}
                                            color={colors.hyperTextSecondary}
                                        />
                                    )}
                                </View>
                                <Text className="text-text-primary mt-3 text-sm">
                                    {overviewLoading
                                        ? "正在读取阅读记录…"
                                        : "还没有可继续的阅读记录"}
                                </Text>
                                {!overviewLoading ? (
                                    <Text className="mt-1 text-[13px] text-primary">
                                        去看看笔记
                                    </Text>
                                ) : null}
                            </Pressable>
                        )}
                    </View>

                    <View>
                        <SectionTitle>我的内容</SectionTitle>
                        <Card
                            className="overflow-hidden rounded-hyper-card"
                            style={cardStyle}
                        >
                            <ContentRow
                                icon={FileText}
                                label="全部笔记"
                                value={
                                    overview.noteCount == null
                                        ? undefined
                                        : `${overview.noteCount} 篇`
                                }
                                onPress={() => openNotes()}
                            />
                            <ContentRow
                                icon={Star}
                                label="星标笔记"
                                value={
                                    overview.starredCount == null
                                        ? undefined
                                        : `${overview.starredCount} 篇`
                                }
                                onPress={() => openNotes("starred")}
                            />
                            <ContentRow
                                icon={Archive}
                                label="草稿箱"
                                onPress={() => openNotes(undefined, true)}
                            />
                            <ContentRow
                                icon={Trash2}
                                label="垃圾桶"
                                last
                                onPress={() => router.push("/pages/user/trash")}
                            />
                        </Card>
                    </View>
                </View>
            </ScrollView>
        </Screen>
    );
}

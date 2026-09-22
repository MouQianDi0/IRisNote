import { useAuth } from "@/features/auth/hooks/useAuth";
import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import { cloudStorageStatusLabel } from "@/core/cloud-storage/cloud-storage-policy";
import { banner } from "@/core/notifications";
import { colors } from "@/shared/theme";
import { Card, Screen } from "@/shared/ui";
import Constants from "expo-constants";
import * as Application from "expo-application";
import { checkForUpdate } from "@/features/updates/update-store";
import { router, type Href } from "expo-router";
import {
    Bell,
    BookOpenText,
    CircleHelp,
    Cloud,
    Database,
    ExternalLink,
    Info,
    LogOut,
    Palette,
    ShieldCheck,
    Smartphone,
    UserRound,
} from "lucide-react-native";
import { useState } from "react";
import {
    ActivityIndicator,
    Linking,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { SettingsOverviewItem } from "../components/SettingsOverviewItem";
import { SettingsPageHeader } from "../components/SettingsPageHeader";
import { SettingsRow } from "../components/SettingsRow";
import { ICP_FILING_NUMBER, ICP_QUERY_URL } from "../data/support-links";

const cardStyle = { borderCurve: "continuous" as const };
const welcomeRoute = "/auth/welcome" as Href;
const permissionsRoute = "/pages/user/permissions" as Href;
const cloudStorageRoute = "/pages/user/cloud-storage" as Href;
const aboutRoute = "/pages/user/about" as Href;
const helpFeedbackRoute = "/pages/user/help-feedback" as Href;

function SettingsGroupTitle({ children }: { children: string }) {
    return (
        <Text className="mb-2 ml-1 text-[13px] text-hyper-text-secondary">
            {children}
        </Text>
    );
}

export default function SettingsScreen() {
    const { isLoggedIn, loading, logout, user } = useAuth();
    const cloudStorage = useCloudStorage();
    const cloudStatus = cloudStorageStatusLabel(cloudStorage);
    const cloudOverview = !cloudStorage.available
        ? "未开放"
        : !cloudStorage.ready
          ? "读取中"
          : cloudStorage.enabled
            ? "已开启"
            : "仅本机";
    const [loggingOut, setLoggingOut] = useState(false);
    const version =
        Application.nativeApplicationVersion ??
        Constants.expoConfig?.version ??
        "—";

    const returnToUser = () => {
        if (router.canGoBack()) {
            router.back();
            return;
        }
        router.replace("/(tabs)/user");
    };

    const logoutAndReturn = async () => {
        if (loggingOut) return;
        setLoggingOut(true);
        try {
            await logout();
            router.replace(welcomeRoute);
        } finally {
            setLoggingOut(false);
        }
    };

    const openFilingQuery = async () => {
        try {
            await Linking.openURL(ICP_QUERY_URL);
        } catch {
            banner.show({
                title: "无法打开备案查询网站",
                message: "请稍后重试",
                type: "neutral",
            });
        }
    };

    if (loading) {
        return (
            <Screen className="items-center justify-center bg-app-background">
                <ActivityIndicator
                    accessibilityLabel="正在加载设置"
                    color={colors.primary}
                />
            </Screen>
        );
    }

    if (!isLoggedIn || !user) {
        return (
            <Screen className="bg-app-background">
                <View className="w-full max-w-[560px] flex-1 self-center px-4">
                    <SettingsPageHeader
                        title="设置"
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
                                登录后可以查看账户信息并管理 IRisNote 设置。
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

    // const displayName = user.nickname?.trim() || user.email.split("@")[0];
    // const joinedAt = new Date(user.created_at).toLocaleDateString("zh-CN");

    return (
        <Screen className="bg-app-background">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 32 }}
                showsVerticalScrollIndicator={false}
            >
                <View className="w-full max-w-[560px] self-center px-4">
                    <SettingsPageHeader
                        title="设置"
                        backLabel="返回用户中心"
                        onBack={returnToUser}
                    />

                    {/* <Card
                        className="flex-row items-center rounded-hyper-card p-4"
                        style={cardStyle}
                    >
                        <Pressable
                            accessibilityLabel={`更换${displayName}的头像`}
                            accessibilityRole="button"
                            accessibilityState={{ disabled: avatarUploading }}
                            className="h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-hyper-card-selected active:opacity-[0.85]"
                            disabled={avatarUploading}
                            onPress={showAvatarOptions}
                        >
                            {avatarSource ? (
                                <Image
                                    key={avatarKey}
                                    source={avatarSource}
                                    className="h-full w-full rounded-full"
                                />
                            ) : (
                                <UserRound size={26} color={colors.primary} />
                            )}
                            {avatarUploading ? (
                                <View className="absolute inset-0 items-center justify-center bg-overlay">
                                    <ActivityIndicator
                                        accessibilityLabel="正在上传头像"
                                        color={colors.surfaceFull}
                                    />
                                </View>
                            ) : null}
                        </Pressable>
                        <View className="ml-3 min-w-0 flex-1">
                            <Text
                                className="text-[17px] text-text-primary"
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
                            <Text className="mt-1 text-[13px] text-hyper-text-secondary">
                                {joinedAt} 加入
                            </Text>
                        </View>
                        <Pressable
                            accessibilityLabel="更换头像"
                            accessibilityRole="button"
                            accessibilityState={{ disabled: avatarUploading }}
                            className="h-11 w-11 items-center justify-center rounded-full active:bg-hyper-card-selected active:opacity-[0.85]"
                            disabled={avatarUploading}
                            onPress={showAvatarOptions}
                        >
                            <Camera size={18} color={colors.primary} />
                        </Pressable>
                    </Card> */}

                    <Card
                        accessible
                        accessibilityLabel="当前设置概览"
                        className="mt-4 flex-row rounded-hyper-card px-2 py-3"
                        style={cardStyle}
                    >
                        <SettingsOverviewItem
                            icon={Palette}
                            label="外观"
                            value="浅色"
                        />
                        <SettingsOverviewItem
                            icon={BookOpenText}
                            label="阅读"
                            value="默认"
                        />
                        <SettingsOverviewItem
                            icon={Bell}
                            label="通知"
                            value="站内"
                        />
                        <SettingsOverviewItem
                            icon={Cloud}
                            label="同步"
                            value={cloudOverview}
                        />
                    </Card>

                    <View className="mt-5">
                        <SettingsGroupTitle>偏好设置</SettingsGroupTitle>
                        <Card
                            className="overflow-hidden rounded-hyper-card"
                            style={cardStyle}
                        >
                            <SettingsRow
                                icon={Palette}
                                label="外观与主题"
                                value="浅色"
                                description="深色模式与跟随系统尚未接入"
                                disabled
                            />
                            <SettingsRow
                                icon={BookOpenText}
                                label="编辑与阅读"
                                value="规划中"
                                description="字号、行距与默认阅读体验将在后续开放"
                                disabled
                                last
                            />
                        </Card>
                    </View>

                    <View className="mt-5">
                        <SettingsGroupTitle>数据与隐私</SettingsGroupTitle>
                        <Card
                            className="overflow-hidden rounded-hyper-card"
                            style={cardStyle}
                        >
                            <SettingsRow
                                icon={Smartphone}
                                label="权限设置"
                                description="管理云存储、通知、相机与更新安装授权"
                                onPress={() => router.push(permissionsRoute)}
                            />
                            <SettingsRow
                                icon={Cloud}
                                label="同步与备份"
                                value={cloudStatus}
                                description="统一管理笔记、待办等内容的云存储授权"
                                onPress={() => router.push(cloudStorageRoute)}
                            />
                            <SettingsRow
                                icon={Database}
                                label="数据与存储"
                                description="查看本地占用，选择清理缓存与临时文件"
                                onPress={() =>
                                    router.push(
                                        "/pages/user/data-storage" as Href,
                                    )
                                }
                            />
                            <SettingsRow
                                icon={ShieldCheck}
                                label="隐私与安全"
                                value="规划中"
                                description="应用锁与账户安全设置尚未接入"
                                disabled
                                last
                            />
                        </Card>
                    </View>

                    <View className="mt-5">
                        <SettingsGroupTitle>支持</SettingsGroupTitle>
                        <Card
                            className="overflow-hidden rounded-hyper-card"
                            style={cardStyle}
                        >
                            <SettingsRow
                                icon={CircleHelp}
                                label="帮助与反馈"
                                description="反馈邮箱、Discord 频道与使用帮助"
                                onPress={() => router.push(helpFeedbackRoute)}
                            />
                            <SettingsRow
                                icon={Info}
                                label="关于 IRisNote"
                                value={`v${version}`}
                                description="查看当前版本与历史更新记录"
                                onPress={() => router.push(aboutRoute)}
                            />
                            <SettingsRow
                                icon={Cloud}
                                label="检查更新"
                                onPress={() => void checkForUpdate(true)}
                            />
                            <SettingsRow
                                icon={ExternalLink}
                                label="ICP备案号"
                                description={ICP_FILING_NUMBER}
                                onPress={() => void openFilingQuery()}
                                last
                            />
                        </Card>
                    </View>

                    <Pressable
                        accessibilityLabel={
                            loggingOut ? "正在退出登录" : "退出登录"
                        }
                        accessibilityRole="button"
                        accessibilityState={{ disabled: loggingOut }}
                        className="mt-4 h-12 flex-row items-center justify-center rounded-hyper-card bg-white active:opacity-[0.85]"
                        disabled={loggingOut}
                        onPress={logoutAndReturn}
                        style={cardStyle}
                    >
                        {loggingOut ? (
                            <ActivityIndicator
                                color={colors.danger}
                                size="small"
                            />
                        ) : (
                            <LogOut size={18} color={colors.danger} />
                        )}
                        <Text className="ml-2 text-[17px] text-danger">
                            {loggingOut ? "正在退出…" : "退出登录"}
                        </Text>
                    </Pressable>
                </View>
            </ScrollView>
        </Screen>
    );
}

import { banner } from "@/core/notifications";
import { colors } from "@/shared/theme";
import { Card, Screen } from "@/shared/ui";
import * as Application from "expo-application";
import * as Clipboard from "expo-clipboard";
import Constants from "expo-constants";
import { router } from "expo-router";
import {
    ChevronRight,
    CircleHelp,
    Copy,
    Mail,
    MessageCircle,
} from "lucide-react-native";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { SettingsPageHeader } from "../components/SettingsPageHeader";
import { SettingsRow } from "../components/SettingsRow";
import { DISCORD_CHANNEL_URL, FEEDBACK_EMAIL } from "../data/support-links";

export default function HelpFeedbackScreen() {
    const version =
        Application.nativeApplicationVersion ??
        Constants.expoConfig?.version ??
        "未知";
    const buildCode = Application.nativeBuildVersion ?? "未知";

    const openEmail = async () => {
        const subject = encodeURIComponent(`IRisNote v${version} 使用反馈`);
        const body = encodeURIComponent(
            `请在这里描述你遇到的问题或建议：\n\n\n应用版本：${version}\n构建号：${buildCode}`,
        );
        try {
            await Linking.openURL(
                `mailto:${FEEDBACK_EMAIL}?subject=${subject}&body=${body}`,
            );
        } catch {
            banner.show({
                title: "无法打开邮件应用",
                message: "可以复制反馈邮箱后使用其他邮件应用联系",
                type: "neutral",
            });
        }
    };

    const copyEmail = async () => {
        try {
            await Clipboard.setStringAsync(FEEDBACK_EMAIL);
            banner.show({ title: "反馈邮箱已复制", type: "success" });
        } catch {
            banner.show({ title: "复制失败，请稍后重试", type: "neutral" });
        }
    };

    const openDiscord = async () => {
        if (!DISCORD_CHANNEL_URL) return;
        try {
            await Linking.openURL(DISCORD_CHANNEL_URL);
        } catch {
            banner.show({
                title: "无法打开 Discord 频道",
                message: "请稍后重试",
                type: "neutral",
            });
        }
    };

    return (
        <Screen className="bg-app-background">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 32 }}
                showsVerticalScrollIndicator={false}
            >
                <View className="w-full max-w-[560px] self-center px-4">
                    <SettingsPageHeader
                        title="帮助与反馈"
                        backLabel="返回设置"
                        onBack={() => router.back()}
                    />

                    <Text className="mb-2 ml-1 text-[13px] text-hyper-text-secondary">
                        联系我们
                    </Text>
                    <Card
                        className="overflow-hidden rounded-hyper-card"
                        style={{ borderCurve: "continuous" }}
                    >
                        <View className="min-h-16 flex-row items-center px-4 py-3">
                            <Mail size={22} color={colors.primary} />
                            <Pressable
                                accessibilityLabel={`通过邮件反馈，邮箱 ${FEEDBACK_EMAIL}`}
                                accessibilityRole="button"
                                className="ml-3 min-w-0 flex-1 py-1 active:opacity-[0.75]"
                                onPress={() => void openEmail()}
                            >
                                <Text className="text-[17px] text-text-primary">
                                    反馈邮箱
                                </Text>
                                <Text
                                    className="mt-1 text-sm text-text-secondary"
                                    numberOfLines={1}
                                >
                                    {FEEDBACK_EMAIL}
                                </Text>
                            </Pressable>
                            <Pressable
                                accessibilityLabel="复制反馈邮箱"
                                accessibilityRole="button"
                                className="h-11 min-w-11 flex-row items-center justify-center rounded-hyper-control px-2 active:bg-surface-muted active:opacity-[0.85]"
                                onPress={() => void copyEmail()}
                            >
                                <Copy size={16} color={colors.primary} />
                                <Text className="ml-1 text-sm text-primary">
                                    复制
                                </Text>
                            </Pressable>
                            <ChevronRight size={18} color={colors.textMuted} />
                        </View>
                        <View className="mx-4 h-px bg-hyper-divider" />
                        <SettingsRow
                            icon={MessageCircle}
                            label="Discord 频道"
                            value={DISCORD_CHANNEL_URL ? "打开频道" : "待配置"}
                            description={
                                DISCORD_CHANNEL_URL
                                    ? "交流使用体验与反馈问题"
                                    : "频道地址确认后开放"
                            }
                            disabled={!DISCORD_CHANNEL_URL}
                            onPress={() => void openDiscord()}
                            last
                        />
                    </Card>

                    <Text className="mb-2 ml-1 mt-5 text-[13px] text-hyper-text-secondary">
                        使用帮助
                    </Text>
                    <Card
                        className="overflow-hidden rounded-hyper-card"
                        style={{ borderCurve: "continuous" }}
                    >
                        <SettingsRow
                            icon={CircleHelp}
                            label="帮助内容"
                            value="整理中"
                            description="常见问题和使用指南将在后续补充"
                            disabled
                            last
                        />
                    </Card>
                </View>
            </ScrollView>
        </Screen>
    );
}

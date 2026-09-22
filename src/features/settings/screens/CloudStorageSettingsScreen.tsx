import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import {
    cloudStorageStatusLabel,
} from "@/core/cloud-storage/cloud-storage-policy";
import { colors } from "@/shared/theme";
import { Card, Screen } from "@/shared/ui";
import { router } from "expo-router";
import { Cloud, Database } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, View } from "react-native";
import { SettingsPageHeader } from "../components/SettingsPageHeader";
import { SettingsRow } from "../components/SettingsRow";

const cardStyle = { borderCurve: "continuous" as const, borderRadius: 16 };

export default function CloudStorageSettingsScreen() {
    const cloudStorage = useCloudStorage();
    const [actionError, setActionError] = useState<{
        ownerUserId: number | null;
        message: string;
    } | null>(null);
    const status = cloudStorageStatusLabel(cloudStorage);
    const busy =
        !cloudStorage.ready ||
        cloudStorage.saving ||
        cloudStorage.ownerUserId === null;
    const disabled = busy || (!cloudStorage.available && !cloudStorage.consented);
    const retryDisabled = busy || (!cloudStorage.available && cloudStorage.consented);
    const error = cloudStorage.error ||
        (actionError?.ownerUserId === cloudStorage.ownerUserId ? actionError.message : null);
    const description = !cloudStorage.available
        ? "当前版本暂未开放云存储，已有本机内容仍可正常使用。"
        : cloudStorage.ownerUserId === null
          ? "登录后可为当前账号开启云存储授权。"
          : cloudStorage.enabled
            ? "已允许本设备同步笔记、待办等内容；后续云存储功能也受此授权控制。"
            : "尚未允许云端传输，笔记和待办继续保存在本机。";

    const changeConsent = async (enabled: boolean) => {
        if (busy || (enabled && !cloudStorage.available)) return;
        const ownerUserId = cloudStorage.ownerUserId;
        setActionError(null);
        try {
            await cloudStorage.setConsent(enabled);
        } catch (cause) {
            setActionError({
                ownerUserId,
                message: cause instanceof Error ? cause.message : "授权保存失败，请重试",
            });
        }
    };

    return (
        <Screen className="bg-app-background">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 32 }}
                contentInsetAdjustmentBehavior="automatic"
                showsVerticalScrollIndicator={false}
            >
                <View className="w-full max-w-[560px] self-center px-4">
                    <SettingsPageHeader
                        title="同步与备份"
                        backLabel="返回设置"
                        onBack={() => router.canGoBack() ? router.back() : router.replace("/pages/user/settings")}
                    />
                    <Card style={cardStyle}>
                        <SettingsRow
                            icon={Cloud}
                            label="允许云存储"
                            description="统一控制笔记、待办及后续云存储功能"
                            trailing={
                                <Switch
                                    accessibilityLabel="允许云存储"
                                    accessibilityHint="开启后允许当前账号在本设备同步云端内容"
                                    value={cloudStorage.ready && cloudStorage.consented}
                                    disabled={disabled}
                                    trackColor={{ false: colors.divider, true: colors.primary }}
                                    thumbColor={colors.surface}
                                    onValueChange={(enabled) => void changeConsent(enabled)}
                                />
                            }
                            last
                        />
                    </Card>
                    <Card style={{ ...cardStyle, marginTop: 20, padding: 16 }}>
                        <View style={{ minHeight: 56, justifyContent: "center", gap: 4 }}>
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                                <Text style={{ flexShrink: 1, color: colors.textPrimary, fontSize: 17 }}>
                                    当前状态：{cloudStorage.saving ? "正在保存" : status}
                                </Text>
                                {(!cloudStorage.ready || cloudStorage.saving) && (
                                    <ActivityIndicator color={colors.primary} accessibilityLabel="正在读取或保存云存储授权" />
                                )}
                            </View>
                            <Text selectable style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                                {description}
                            </Text>
                        </View>
                        {!!error && (
                            <View style={{ marginTop: 12, gap: 4 }}>
                                <Text selectable accessibilityRole="alert" style={{ color: colors.danger, fontSize: 14, lineHeight: 20 }}>
                                    {error}
                                </Text>
                                <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel="重试保存云存储授权"
                                    accessibilityState={{ disabled: retryDisabled }}
                                    disabled={retryDisabled}
                                    onPress={() => void changeConsent(cloudStorage.consented)}
                                    style={{ minHeight: 48, justifyContent: "center", opacity: retryDisabled ? 0.5 : 1 }}
                                >
                                    <Text style={{ color: colors.primary, fontSize: 14 }}>重试保存</Text>
                                </Pressable>
                            </View>
                        )}
                    </Card>
                    <Card style={{ ...cardStyle, marginTop: 20 }}>
                        <SettingsRow
                            icon={Database}
                            label="同步队列"
                            description="查看保留在本机的待同步内容"
                            onPress={() => router.push("/pages/user/sync-queue")}
                            last
                        />
                    </Card>
                    <View style={{ marginTop: 20, paddingHorizontal: 16, gap: 4 }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                            授权仅对当前账号和本设备生效。关闭后暂停上传、下载和自动重试，不删除本机或已有云端数据。
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>
                            独立的历史备份与恢复功能尚未开放。
                        </Text>
                    </View>
                </View>
            </ScrollView>
        </Screen>
    );
}

import { readDiagnosticEvents } from "@/core/diagnostics";
import { useDebouncedNavigation } from "@/core/navigation/hooks/useDebouncedNavigation";
import { banner } from "@/core/notifications";
import { colors } from "@/shared/theme";
import { Card, ListRow, PageHeader, Screen } from "@/shared/ui";
import * as Clipboard from "expo-clipboard";
import { router, useFocusEffect, type Href } from "expo-router";
import {
    Copy,
    FileText,
    PowerOff,
    TestTube2,
    Timer,
} from "lucide-react-native";
import { useCallback, useRef, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import { useDeveloperModeGuard } from "../hooks/use-developer-mode";
import { useNotificationTestTools } from "../hooks/use-notification-test-tools";
import { collectDeveloperEnvironment } from "../services/developer-environment";
import { setDeveloperMode } from "../state/developer-mode-store";
import {
    developerEnvironmentRows,
    formatDeveloperEnvironment,
    type DeveloperEnvironmentSnapshot,
} from "../utils/developer-environment-report";

const cardStyle = { borderCurve: "continuous" as const };
const logsRoute = "/pages/user/developer/logs" as Href;

type EnvironmentState =
    | { kind: "loading" }
    | { kind: "ready"; snapshot: DeveloperEnvironmentSnapshot }
    | { kind: "error" };

function GroupTitle({ children }: { children: string }) {
    return (
        <Text className="mb-2 ml-1 text-[13px] text-hyper-text-secondary">
            {children}
        </Text>
    );
}

export default function DeveloperOptionsScreen() {
    const navigate = useDebouncedNavigation();
    const { database, ready, enabled } = useDeveloperModeGuard();
    const tools = useNotificationTestTools();
    const [environment, setEnvironment] = useState<EnvironmentState>({
        kind: "loading",
    });
    const [logCount, setLogCount] = useState<number | null>(null);
    const [closing, setClosing] = useState(false);
    const loadSerial = useRef(0);

    // 从系统设置改完权限返回时重新读取，环境信息与日志条数保持最新。
    useFocusEffect(
        useCallback(() => {
            const serial = ++loadSerial.current;
            collectDeveloperEnvironment().then(
                (snapshot) => {
                    if (serial === loadSerial.current)
                        setEnvironment({ kind: "ready", snapshot });
                },
                () => {
                    if (serial === loadSerial.current)
                        setEnvironment({ kind: "error" });
                },
            );
            readDiagnosticEvents().then(
                (events) => {
                    if (serial === loadSerial.current)
                        setLogCount(events.length);
                },
                () => {
                    if (serial === loadSerial.current) setLogCount(null);
                },
            );
        }, []),
    );

    const copyEnvironment = async () => {
        if (environment.kind !== "ready") return;
        try {
            await Clipboard.setStringAsync(
                formatDeveloperEnvironment(environment.snapshot, new Date()),
            );
            banner.show({ title: "环境信息已复制", type: "success" });
        } catch {
            banner.show({ title: "复制失败，请稍后重试", type: "neutral" });
        }
    };

    // 关闭后由页面守卫统一返回设置页，这里不重复导航。
    const closeDeveloperMode = async () => {
        if (closing) return;
        setClosing(true);
        try {
            await setDeveloperMode(database, false);
            banner.show({ title: "开发者模式已关闭", type: "neutral" });
        } catch {
            setClosing(false);
            banner.show({
                title: "关闭失败",
                message: "请稍后重试",
                type: "important",
            });
        }
    };

    if (!ready || !enabled) {
        return (
            <Screen className="items-center justify-center bg-app-background">
                <ActivityIndicator color={colors.primary} />
            </Screen>
        );
    }

    return (
        <Screen className="bg-app-background">
            <ScrollView
                className="flex-1"
                contentContainerStyle={{ paddingBottom: 32 }}
                showsVerticalScrollIndicator={false}
            >
                <View className="w-full max-w-[560px] self-center px-4">
                    <PageHeader
                        title="开发者选项"
                        backLabel="返回设置"
                        onBack={() => router.back()}
                    />
                    <Text className="mb-4 ml-1 text-[13px] leading-5 text-hyper-text-secondary">
                        这些工具用于排查问题，不会改动笔记和待办数据。
                    </Text>

                    <View className="mb-2 flex-row items-center justify-between">
                        <Text className="ml-1 text-[13px] text-hyper-text-secondary">
                            运行环境
                        </Text>
                        <Pressable
                            accessibilityLabel="复制运行环境信息"
                            accessibilityRole="button"
                            accessibilityState={{
                                disabled: environment.kind !== "ready",
                            }}
                            className="h-9 flex-row items-center rounded-hyper-control px-2 active:bg-surface-muted active:opacity-[0.85]"
                            disabled={environment.kind !== "ready"}
                            onPress={() => void copyEnvironment()}
                        >
                            <Copy
                                size={14}
                                color={
                                    environment.kind === "ready"
                                        ? colors.primary
                                        : colors.textMuted
                                }
                            />
                            <Text
                                className={
                                    environment.kind === "ready"
                                        ? "ml-1 text-sm text-primary"
                                        : "ml-1 text-sm text-text-muted"
                                }
                            >
                                复制
                            </Text>
                        </Pressable>
                    </View>
                    <Card
                        className="overflow-hidden rounded-hyper-card"
                        style={cardStyle}
                    >
                        {environment.kind === "loading" ? (
                            <View className="items-center py-6">
                                <ActivityIndicator
                                    accessibilityLabel="正在读取运行环境"
                                    color={colors.primary}
                                />
                            </View>
                        ) : environment.kind === "error" ? (
                            <Text className="px-4 py-5 text-sm text-text-secondary">
                                运行环境读取失败，返回后重新进入可重试。
                            </Text>
                        ) : (
                            developerEnvironmentRows(environment.snapshot).map(
                                (row, index, rows) => (
                                    <View key={row.label}>
                                        <View
                                            accessible
                                            accessibilityLabel={`${row.label}，${row.value}`}
                                            className="flex-row items-start justify-between gap-4 px-4 py-3"
                                        >
                                            <Text className="text-text-primary text-[15px]">
                                                {row.label}
                                            </Text>
                                            <Text
                                                selectable
                                                className="min-w-0 flex-1 text-right text-[13px] leading-5 text-text-secondary"
                                            >
                                                {row.value}
                                            </Text>
                                        </View>
                                        {index < rows.length - 1 ? (
                                            <View className="mx-4 h-px bg-hyper-divider" />
                                        ) : null}
                                    </View>
                                ),
                            )
                        )}
                    </Card>

                    <View className="mt-5">
                        <GroupTitle>诊断</GroupTitle>
                        <Card
                            className="overflow-hidden rounded-hyper-card"
                            style={cardStyle}
                        >
                            <ListRow
                                icon={FileText}
                                label="诊断日志"
                                value={
                                    logCount === null
                                        ? undefined
                                        : `${logCount} 条`
                                }
                                description="查看最近 400 条诊断事件（已脱敏）"
                                onPress={() => navigate(logsRoute)}
                            />
                            <ListRow
                                icon={TestTube2}
                                label="发送测试通知"
                                value={tools.testing ? "正在发送" : "立即发送"}
                                description="发送一条普通系统通知并自动写入诊断日志"
                                disabled={
                                    tools.testing ||
                                    !tools.testNotificationReady
                                }
                                onPress={() =>
                                    void tools.sendTestNotification()
                                }
                            />
                            <ListRow
                                icon={Timer}
                                label="测试待办动态通知"
                                value={
                                    tools.liveTesting
                                        ? `演示中 ${tools.liveRemaining}s`
                                        : tools.liveUpdateReady
                                          ? "立即演示"
                                          : "需 Android 16+"
                                }
                                description="运行 60 秒模拟待办；可按 Home 验证后台进度与到点撤卡，需 Android 16+"
                                disabled={
                                    tools.liveTesting || !tools.liveUpdateReady
                                }
                                onPress={() => void tools.startLiveDemo()}
                                last
                            />
                        </Card>
                    </View>

                    <Pressable
                        accessibilityLabel={
                            closing ? "正在关闭开发者模式" : "关闭开发者模式"
                        }
                        accessibilityRole="button"
                        accessibilityState={{ disabled: closing }}
                        className="mt-5 h-12 flex-row items-center justify-center rounded-hyper-card bg-white active:opacity-[0.85]"
                        disabled={closing}
                        onPress={() => void closeDeveloperMode()}
                        style={cardStyle}
                    >
                        {closing ? (
                            <ActivityIndicator
                                color={colors.danger}
                                size="small"
                            />
                        ) : (
                            <PowerOff size={18} color={colors.danger} />
                        )}
                        <Text className="ml-2 text-[17px] text-danger">
                            关闭开发者模式
                        </Text>
                    </Pressable>
                    <Text className="mt-2 text-center text-[13px] text-hyper-text-secondary">
                        关闭后可在「关于 IRisNote」连点版本号重新开启
                    </Text>
                </View>
            </ScrollView>
        </Screen>
    );
}

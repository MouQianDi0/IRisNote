import {
    clearDiagnosticLog,
    readDiagnosticEvents,
    type DiagnosticEvent,
    type DiagnosticLevel,
} from "@/core/diagnostics";
import { banner } from "@/core/notifications";
import { colors } from "@/shared/theme";
import { PageHeader, Screen } from "@/shared/ui";
import { DialogButton, DraftDialog } from "@/shared/ui/Dialog/dialog";
import { router, useFocusEffect } from "expo-router";
import { Trash2 } from "lucide-react-native";
import { useCallback, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    FlatList,
    Pressable,
    Text,
    View,
} from "react-native";
import { useDeveloperModeGuard } from "../hooks/use-developer-mode";
import {
    countDiagnosticLevels,
    diagnosticDetailsText,
    diagnosticTimeLabel,
    filterDiagnosticEvents,
    type DiagnosticFilter,
} from "../utils/diagnostic-log-view";

const cardStyle = { borderCurve: "continuous" as const };

const FILTERS: readonly { key: DiagnosticFilter; label: string }[] = [
    { key: "all", label: "全部" },
    { key: "info", label: "信息" },
    { key: "warning", label: "警告" },
    { key: "error", label: "错误" },
];

const LEVEL_LABEL: Readonly<Record<DiagnosticLevel, string>> = {
    info: "信息",
    warning: "警告",
    error: "错误",
};

const LEVEL_CLASS: Readonly<Record<DiagnosticLevel, string>> = {
    info: "text-[13px] text-hyper-text-secondary",
    warning: "text-[13px] text-warning",
    error: "text-[13px] text-danger",
};

type LogState =
    | { kind: "loading" }
    | { kind: "ready"; events: DiagnosticEvent[] }
    | { kind: "error" };

function EventRow({ event }: { event: DiagnosticEvent }) {
    const details = diagnosticDetailsText(event.details);
    return (
        <View
            className="mb-2 rounded-hyper-card bg-white px-4 py-3"
            style={cardStyle}
        >
            <View className="flex-row items-center justify-between">
                <Text className="text-[13px] text-hyper-text-secondary">
                    {diagnosticTimeLabel(event.timestamp)}
                </Text>
                <Text className={LEVEL_CLASS[event.level]}>
                    {LEVEL_LABEL[event.level]}
                </Text>
            </View>
            <Text selectable className="text-text-primary mt-1 text-[15px]">
                {event.scope} · {event.event}
            </Text>
            {details ? (
                <Text
                    selectable
                    className="mt-1 text-[13px] leading-5 text-text-secondary"
                >
                    {details}
                </Text>
            ) : null}
        </View>
    );
}

export default function DiagnosticLogScreen() {
    const { ready, enabled } = useDeveloperModeGuard();
    const [state, setState] = useState<LogState>({ kind: "loading" });
    const [filter, setFilter] = useState<DiagnosticFilter>("all");
    const [confirming, setConfirming] = useState(false);
    const [clearing, setClearing] = useState(false);
    const loadSerial = useRef(0);

    const load = useCallback(() => {
        const serial = ++loadSerial.current;
        readDiagnosticEvents().then(
            (events) => {
                if (serial === loadSerial.current)
                    setState({ kind: "ready", events });
            },
            () => {
                if (serial === loadSerial.current) setState({ kind: "error" });
            },
        );
    }, []);

    useFocusEffect(load);

    const events = useMemo(
        () => (state.kind === "ready" ? state.events : []),
        [state],
    );
    const counts = useMemo(() => countDiagnosticLevels(events), [events]);
    const visible = useMemo(
        () => filterDiagnosticEvents(events, filter),
        [events, filter],
    );

    const clear = async () => {
        if (clearing) return;
        setClearing(true);
        try {
            await clearDiagnosticLog();
            setConfirming(false);
            banner.show({ title: "诊断日志已清空", type: "success" });
        } catch {
            banner.show({
                title: "清空失败",
                message: "请稍后重试",
                type: "important",
            });
        } finally {
            setClearing(false);
            load();
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
            <View className="w-full max-w-[560px] flex-1 self-center px-4">
                <PageHeader
                    title="诊断日志"
                    backLabel="返回开发者选项"
                    onBack={() => router.back()}
                />
                <View className="mb-3 flex-row flex-wrap gap-2">
                    {FILTERS.map((item) => {
                        const selected = filter === item.key;
                        return (
                            <Pressable
                                key={item.key}
                                accessibilityLabel={`${item.label}，${counts[item.key]} 条`}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                                className={
                                    selected
                                        ? "h-9 justify-center rounded-full bg-primary px-3 active:opacity-[0.85]"
                                        : "h-9 justify-center rounded-full bg-white px-3 active:opacity-[0.85]"
                                }
                                onPress={() => setFilter(item.key)}
                            >
                                <Text
                                    className={
                                        selected
                                            ? "text-sm text-white"
                                            : "text-sm text-text-secondary"
                                    }
                                >
                                    {item.label} {counts[item.key]}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>

                {state.kind === "loading" ? (
                    <View className="flex-1 items-center pt-10">
                        <ActivityIndicator
                            accessibilityLabel="正在读取诊断日志"
                            color={colors.primary}
                        />
                    </View>
                ) : state.kind === "error" ? (
                    <View className="flex-1 items-center pt-10">
                        <Text className="text-sm text-text-secondary">
                            诊断日志读取失败
                        </Text>
                        <Pressable
                            accessibilityLabel="重试读取诊断日志"
                            accessibilityRole="button"
                            className="mt-4 min-h-12 items-center justify-center rounded-hyper-control bg-primary px-6 active:opacity-[0.85]"
                            onPress={load}
                        >
                            <Text className="text-base text-white">重试</Text>
                        </Pressable>
                    </View>
                ) : (
                    <FlatList
                        className="flex-1"
                        data={visible}
                        keyExtractor={(item, index) =>
                            `${item.timestamp}:${index}`
                        }
                        renderItem={({ item }) => <EventRow event={item} />}
                        contentContainerStyle={{ paddingBottom: 24 }}
                        showsVerticalScrollIndicator={false}
                        ListEmptyComponent={
                            <Text className="pt-10 text-center text-sm text-text-secondary">
                                {events.length
                                    ? "当前筛选下没有事件"
                                    : "暂无诊断事件"}
                            </Text>
                        }
                        ListFooterComponent={
                            events.length ? (
                                <Pressable
                                    accessibilityLabel="清空诊断日志"
                                    accessibilityRole="button"
                                    className="mt-3 h-12 flex-row items-center justify-center rounded-hyper-card bg-white active:opacity-[0.85]"
                                    onPress={() => setConfirming(true)}
                                    style={cardStyle}
                                >
                                    <Trash2 size={18} color={colors.danger} />
                                    <Text className="ml-2 text-[17px] text-danger">
                                        清空诊断日志
                                    </Text>
                                </Pressable>
                            ) : null
                        }
                    />
                )}
            </View>

            <DraftDialog
                visible={confirming}
                title="清空诊断日志？"
                onClose={() => {
                    if (!clearing) setConfirming(false);
                }}
            >
                <Text className="text-sm leading-5 text-hyper-text-secondary">
                    清空后无法恢复，已导出的诊断文件副本也会一并删除。
                </Text>
                <View className="mt-3 flex-row gap-2.5">
                    <DialogButton
                        label="取消"
                        variant="secondary"
                        className="flex-1"
                        disabled={clearing}
                        onPress={() => setConfirming(false)}
                    />
                    <DialogButton
                        label={clearing ? "正在清空…" : "清空"}
                        variant="danger"
                        className="flex-1"
                        disabled={clearing}
                        onPress={() => void clear()}
                    />
                </View>
            </DraftDialog>
        </Screen>
    );
}

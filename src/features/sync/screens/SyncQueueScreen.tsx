import { useApplicationDatabase } from "@/core/database";
import { suppressServerConnectionBanner } from "@/core/notifications";
import {
    formatUploadBytes,
    listUploadTasks,
    onUploadQueueChanged,
    useUploadQueueRuntime,
    type UploadQueueTask,
} from "@/core/sync";
import { useAuth } from "@/features/auth/hooks/useAuth";
import {
    cancelUploadTaskWithLocalRollback,
    getUploadTaskCancellationAvailability,
    type UploadTaskCancellationAvailability,
} from "@/features/sync/upload-task-cancellation";
import { colors } from "@/shared/theme";
import { IconButton } from "@/shared/ui";
import { router, useFocusEffect } from "expo-router";
import {
    ArrowLeft,
    Cloud,
    Database,
    Trash2,
    Wifi,
    WifiOff,
} from "lucide-react-native";
import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { SyncTaskDeleteDialog } from "../components/sync-task-delete-dialog";

const statusText: Record<UploadQueueTask["status"], string> = {
    queued: "等待服务器确认",
    running: "正在上传",
    paused: "等待网络恢复",
    blocked: "需要检查",
};

const networkLabel = (type: string, connected: boolean) => {
    if (!connected) return "当前未连接网络";
    if (type === "WIFI") return "当前 Wi-Fi";
    if (type === "CELLULAR") return "当前移动数据";
    return "当前网络已连接";
};

export default function SyncQueueScreen() {
    const database = useApplicationDatabase();
    const { user } = useAuth();
    const runtime = useUploadQueueRuntime();
    const [tasks, setTasks] = useState<UploadQueueTask[]>([]);
    const [cancellationAvailability, setCancellationAvailability] = useState<
        Record<string, UploadTaskCancellationAvailability>
    >({});
    const [deleteTarget, setDeleteTarget] = useState<UploadQueueTask | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useFocusEffect(useCallback(() => suppressServerConnectionBanner(), []));

    const load = useCallback(async () => {
        if (!user) {
            setTasks([]);
            setCancellationAvailability({});
            setLoading(false);
            return;
        }
        try {
            const nextTasks = await listUploadTasks(database, user.id);
            const availabilityEntries = await Promise.all(
                nextTasks.map(async (task) => [
                    task.taskId,
                    await getUploadTaskCancellationAvailability(database, task),
                ] as const),
            );
            setTasks(nextTasks);
            setCancellationAvailability(Object.fromEntries(availabilityEntries));
            setError("");
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : "暂存列表读取失败");
        } finally {
            setLoading(false);
        }
    }, [database, user]);

    useFocusEffect(useCallback(() => {
        void load();
        return onUploadQueueChanged(() => void load());
    }, [load]));

    const estimatedBytes = useMemo(
        () => tasks.reduce((total, task) => total + task.estimatedBytes, 0),
        [tasks],
    );

    const renderItem = useCallback(({ item }: { item: UploadQueueTask }) => {
        const availability = cancellationAvailability[item.taskId];
        const canDelete = availability?.allowed === true;
        const unavailableReason = availability && !availability.allowed
            ? availability.reason
            : undefined;
        const deleteLabel = item.kind === "note-sync"
            ? `回滚本地笔记“${item.title}”`
            : `删除“${item.title}”暂存任务`;
        return (
            <View
                style={{
                    minHeight: 72,
                    padding: 16,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                }}
            >
                <View style={{ flex: 1, gap: 4 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "600" }} numberOfLines={2}>
                        {item.title}
                    </Text>
                    <Text selectable style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                        {item.operationLabel} · 预计 {formatUploadBytes(item.estimatedBytes)} · {statusText[item.status]}
                    </Text>
                    {item.attemptCount > 0 && (
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                            已尝试 {item.attemptCount}/10 次
                        </Text>
                    )}
                    {item.lastError && (
                        <Text selectable style={{ color: colors.danger, fontSize: 12 }} numberOfLines={3}>
                            {item.lastError}
                        </Text>
                    )}
                    {availability && !availability.allowed && item.status !== "running" && (
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }} numberOfLines={2}>
                            {availability.reason}
                        </Text>
                    )}
                </View>
                <IconButton
                    accessibilityLabel={deleteLabel}
                    accessibilityHint={canDelete ? "打开二次确认" : unavailableReason}
                    icon={Trash2}
                    iconSize={20}
                    size="compact"
                    variant="ghost"
                    disabled={!canDelete}
                    onPress={() => setDeleteTarget(item)}
                />
            </View>
        );
    }, [cancellationAvailability]);

    const confirmDelete = useCallback(async (task: UploadQueueTask) => {
        if (!user) throw new Error("登录状态已失效，无法删除暂存任务");
        await cancelUploadTaskWithLocalRollback(database, user.id, task.taskId);
    }, [database, user]);

    const NetworkIcon = runtime.connected ? Wifi : WifiOff;
    return (
        <View style={{ flex: 1, backgroundColor: colors.appBackground }}>
            <View style={{ height: 64, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 }}>
                <Pressable accessibilityRole="button" accessibilityLabel="返回" onPress={() => router.back()}
                    style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22 }}>
                    <ArrowLeft size={24} color={colors.textPrimary} />
                </Pressable>
                <Text accessibilityRole="header" style={{ color: colors.textPrimary, fontSize: 24 }}>同步队列</Text>
                <View style={{ width: 44 }} />
            </View>
            <View style={{ marginHorizontal: 16, marginBottom: 20, padding: 16, borderRadius: 16, backgroundColor: colors.surface, gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Database size={20} color={colors.primary} />
                    <Text style={{ color: colors.textPrimary, fontSize: 16 }}>{tasks.length} 项暂存任务</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <Cloud size={20} color={colors.primary} />
                    <Text selectable style={{ color: colors.textSecondary, fontSize: 14 }}>预计上传 {formatUploadBytes(estimatedBytes)}</Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                    <NetworkIcon size={20} color={runtime.connected ? colors.primary : colors.danger} />
                    <Text style={{ color: colors.textSecondary, fontSize: 14 }}>{networkLabel(runtime.networkType, runtime.connected)}</Text>
                </View>
            </View>
            {loading ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator /></View>
            ) : error ? (
                <View style={{ padding: 20, alignItems: "center", gap: 12 }}>
                    <Text selectable style={{ color: colors.danger }}>{error}</Text>
                    <Pressable accessibilityRole="button" onPress={() => void load()} style={{ minHeight: 48, paddingHorizontal: 16, justifyContent: "center" }}>
                        <Text style={{ color: colors.primary }}>重新读取</Text>
                    </Pressable>
                </View>
            ) : (
                <View
                    style={{
                        flexShrink: 1,
                        marginHorizontal: 16,
                        borderRadius: 16,
                        backgroundColor: colors.surface,
                        overflow: "hidden",
                    }}
                >
                    <FlatList
                        style={{ flexGrow: 0, flexShrink: 1 }}
                        data={tasks}
                        keyExtractor={(item) => item.taskId}
                        renderItem={renderItem}
                        contentInsetAdjustmentBehavior="automatic"
                        ItemSeparatorComponent={() => <View style={{ height: 1, marginHorizontal: 16, backgroundColor: colors.divider }} />}
                        ListEmptyComponent={<View style={{ padding: 24, alignItems: "center" }}><Text style={{ color: colors.textSecondary }}>暂无暂存任务</Text></View>}
                    />
                </View>
            )}
            {deleteTarget && (
                <SyncTaskDeleteDialog
                    key={deleteTarget.taskId}
                    task={deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onConfirm={confirmDelete}
                />
            )}
        </View>
    );
}

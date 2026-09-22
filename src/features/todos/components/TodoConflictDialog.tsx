import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { AppButton } from "@/shared/ui";
import { FormDialog } from "@/shared/ui/Dialog/FormDialog";
import { semanticColors } from "@/shared/theme";
import type { TodoEntity } from "../todos.types";
import { isDeleted, type TodoSyncRecord } from "../sync.types";
import { fromRemote } from "../api/todo-wire";
import { resolveTodoConflict } from "../data/todo-sync.repository";
import { todoRepository } from "../state/todo-store";
import { notifyTodoSyncChanged } from "../state/todo-sync-events";
import { requestTodoSync } from "../state/todo-sync-runtime";

function Version({
    label,
    entity,
    deleted,
}: {
    label: string;
    entity: TodoEntity | null;
    deleted: boolean;
}) {
    return (
        <View style={{ gap: 8 }}>
            <Text style={{ fontSize: 16, color: semanticColors.textPrimary }}>
                {label}
                {deleted ? "（已删除）" : ""}
            </Text>
            {entity && (
                <View
                    style={{
                        padding: 16,
                        gap: 8,
                        borderRadius: 16,
                        backgroundColor: semanticColors.surfaceControl,
                    }}
                >
                    <Text
                        selectable
                        style={{
                            fontSize: 14,
                            color: semanticColors.textPrimary,
                        }}
                    >
                        {entity.body}
                    </Text>
                    <Text
                        selectable
                        style={{
                            fontSize: 13,
                            color: semanticColors.textSecondary,
                        }}
                    >
                        {entity.dateId} · {entity.startTime ?? "无开始时间"}
                        {entity.endTime ? ` – ${entity.endTime}` : ""}
                        {"\n"}
                        优先级：
                        {
                            { low: "不重要", normal: "正常", high: "重要" }[
                                entity.priority
                            ]
                        }{" "}
                        · {entity.isCompleted ? "已完成" : "未完成"}
                        {"\n"}
                        标星：{entity.isStarred ? "是" : "否"} · 置顶：
                        {entity.isPinned ? "是" : "否"} · 提醒：
                        {entity.reminderEnabled ? "开启" : "关闭"}
                        {"\n"}
                        时区参考：{entity.timeZone ?? "无"}
                        {entity.completedAt
                            ? `\n完成时间：${entity.completedAt}`
                            : ""}
                    </Text>
                </View>
            )}
        </View>
    );
}
export function TodoConflictDialog({
    record,
    onClose,
}: {
    record: TodoSyncRecord;
    onClose: () => void;
}) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const deleted = !record.remote || isDeleted(record.remote);
    async function resolve(choice: "cloud" | "local" | "copy") {
        if (busy) return;
        setBusy(true);
        setError("");
        try {
            await todoRepository.syncTransaction(record.ownerKey, (tx) =>
                resolveTodoConflict(
                    tx,
                    record.ownerKey,
                    record.clientId,
                    record.sequence,
                    JSON.stringify(record.remote),
                    choice,
                ),
            );
            notifyTodoSyncChanged();
            requestTodoSync();
            onClose();
        } catch (cause) {
            setError(
                cause instanceof Error ? cause.message : "处理失败，请重试",
            );
        } finally {
            setBusy(false);
        }
    }
    return (
        <FormDialog
            onClose={() => {
                if (!busy) onClose();
            }}
            title={
                <Text
                    accessibilityRole="header"
                    style={{ fontSize: 24, color: semanticColors.textPrimary }}
                >
                    处理待办冲突
                </Text>
            }
            actions={
                <View style={{ gap: 10 }}>
                    <AppButton
                        variant="secondary"
                        label={deleted ? "接受删除" : "采用云端"}
                        disabled={busy}
                        onPress={() => void resolve("cloud")}
                    />
                    {!deleted && (
                        <AppButton
                            label={
                                record.deleted
                                    ? "保留本地删除并重试"
                                    : "保留本地并重试"
                            }
                            disabled={busy}
                            onPress={() => void resolve("local")}
                        />
                    )}
                    <AppButton
                        variant="secondary"
                        label="另存为新待办"
                        disabled={busy}
                        onPress={() => void resolve("copy")}
                    />
                </View>
            }
        >
            <ScrollView
                style={{ flexShrink: 1 }}
                contentContainerStyle={{ gap: 16 }}
            >
                <Text
                    style={{
                        fontSize: 14,
                        color: semanticColors.textSecondary,
                    }}
                >
                    采用云端或接受删除会放弃本地候选；另存会保留本地内容为新待办。关闭弹窗可稍后处理。
                </Text>
                <Version
                    label="本机版本"
                    entity={record.candidate}
                    deleted={record.deleted}
                />
                <Version
                    label="云端版本"
                    entity={
                        record.remote && !isDeleted(record.remote)
                            ? fromRemote(record.remote, record.ownerKey, 1)
                            : null
                    }
                    deleted={deleted}
                />
                {record.base && !isDeleted(record.base) && (
                    <Version
                        label="修改前的共同版本"
                        entity={fromRemote(record.base, record.ownerKey, 1)}
                        deleted={false}
                    />
                )}
                {!!error && (
                    <Text
                        accessibilityRole="alert"
                        style={{
                            fontSize: 14,
                            color: semanticColors.destructive,
                        }}
                    >
                        {error}
                    </Text>
                )}
            </ScrollView>
        </FormDialog>
    );
}

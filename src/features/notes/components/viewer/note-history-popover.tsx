import { colors, semanticColors } from "@/shared/theme";
import { AnchoredPopover, IconButton } from "@/shared/ui";
import { DialogButton } from "@/shared/ui/Dialog/dialog";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react-native";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";
import type { NoteDraftValue } from "../../data/note-draft.repository";
import type { NoteRevisionOrigin } from "../../data/note-revision.repository";
import { useNoteHistory } from "../../hooks/use-note-history";
import {
    createNoteHistoryComparison,
    releaseNoteHistoryComparison,
} from "../../services/note-history-comparison-session";
import {
    formatNoteHistoryTime,
    noteEditTimeLabel,
} from "../../utils/note-history-time";
import NoteHistoryLoading from "./note-history-loading";

type HistoryLevel = "list" | "detail" | "confirm";
type Props = {
    owner: number;
    noteId: number;
    currentValue: NoteDraftValue;
    updatedAt?: string | null;
    disabled?: boolean;
    restoreBlockedReason?: string;
    onOpen: () => void;
    onRestore: (
        revisionId: string,
        expectedRevisionId: string | null,
    ) => Promise<void>;
};

const ORIGIN_LABELS: Record<NoteRevisionOrigin, string> = {
    "local-save": "本地保存",
    "server-reconcile": "云端更新",
    restore: "历史恢复",
    migrate: "初始版本",
};
const formatTime = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? value
        : date.toLocaleString("zh-CN", { hour12: false });
};

/** 时间作为历史锚点；恢复留在气泡，对比 push 独立页面而不移除编辑页。 */
export default function NoteHistoryPopover({
    owner,
    noteId,
    currentValue,
    updatedAt,
    disabled = false,
    restoreBlockedReason,
    onOpen,
    onRestore,
}: Props) {
    const history = useNoteHistory(owner, noteId);
    const anchorRef = useRef<View>(null);
    const mounted = useRef(true);
    const busyRef = useRef(false);
    const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null);
    const openingLocked = useRef(false);
    const comparisonOpening = useRef(false);
    const comparisonToken = useRef<string | null>(null);
    const [visible, setVisible] = useState(false);
    const [level, setLevel] = useState<HistoryLevel>("list");
    const [restoring, setRestoring] = useState(false);
    const [restoreError, setRestoreError] = useState("");

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            if (cooldown.current) clearTimeout(cooldown.current);
            releaseNoteHistoryComparison(comparisonToken.current);
        };
    }, []);

    const close = () => {
        if (busyRef.current || !visible) return;
        history.invalidate();
        setVisible(false);
        // 等待现有气泡退出动画结束，避免连点时旧窗口与新测量互相干扰。
        cooldown.current = setTimeout(() => {
            cooldown.current = null;
            openingLocked.current = false;
            comparisonOpening.current = false;
        }, 300);
    };
    const open = () => {
        if (disabled || openingLocked.current) return;
        openingLocked.current = true;
        onOpen();
        setLevel("list");
        setRestoreError("");
        setVisible(true);
        void history.refresh();
    };
    const back = () => {
        if (busyRef.current) return;
        setRestoreError("");
        if (level === "confirm") setLevel("detail");
        else {
            setLevel("list");
            void history.refresh();
        }
    };
    const restore = async () => {
        if (
            busyRef.current ||
            !history.selected ||
            !history.snapshot ||
            restoreBlockedReason
        )
            return;
        busyRef.current = true;
        setRestoring(true);
        setRestoreError("");
        try {
            await onRestore(
                history.selected.revision_id,
                history.snapshot.note.current_revision_id ?? null,
            );
            if (mounted.current) {
                busyRef.current = false;
                close();
            }
        } catch (cause) {
            if (mounted.current)
                setRestoreError(
                    cause instanceof Error
                        ? cause.message
                        : "恢复失败，当前内容已保留，请重试",
                );
        } finally {
            busyRef.current = false;
            if (mounted.current) setRestoring(false);
        }
    };

    const selected = history.selected;
    const isCurrent =
        !!selected &&
        selected.revision_id === history.snapshot?.note.current_revision_id;
    const categoryName = (id: number | null) =>
        id === null
            ? "默认分类"
            : (history.snapshot?.categories.find((item) => item.id === id)
                  ?.name ?? "分类已不可用");
    const error = restoreError || history.error;

    const compare = () => {
        if (
            comparisonOpening.current ||
            busyRef.current ||
            history.loading ||
            !selected ||
            !history.snapshot
        )
            return;
        comparisonOpening.current = true;
        try {
            releaseNoteHistoryComparison(comparisonToken.current);
            const token = createNoteHistoryComparison({
                owner,
                noteId,
                revisionId: selected.revision_id,
                currentValue,
                createdAt: history.snapshot.note.created_at,
                updatedAt: updatedAt ?? null,
                categories: history.snapshot.categories,
            });
            comparisonToken.current = token;
            close();
            router.push({
                pathname: "/pages/note/history/[id]",
                params: { id: noteId, revisionId: selected.revision_id, token },
            });
        } catch {
            releaseNoteHistoryComparison(comparisonToken.current);
            comparisonToken.current = null;
            comparisonOpening.current = false;
            if (cooldown.current) clearTimeout(cooldown.current);
            cooldown.current = null;
            setVisible(true);
            setRestoreError("打开对比失败，当前编辑已保留，请重试");
        }
    };

    return (
        <>
            <View ref={anchorRef} collapsable={false}>
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${noteEditTimeLabel(updatedAt)}，查看历史版本`}
                    accessibilityState={{ expanded: visible }}
                    disabled={disabled}
                    onPress={open}
                    className="min-h-11 flex-row items-center gap-1 active:opacity-[0.85]"
                >
                    <Text className="text-xs text-text-secondary">
                        {noteEditTimeLabel(updatedAt)}
                    </Text>
                    <ChevronDown size={14} color={colors.textSecondary} />
                </Pressable>
            </View>
            <AnchoredPopover
                visible={visible}
                anchorRef={anchorRef}
                onClose={close}
                width={300}
                maxHeight={520}
                accessibilityLabel="笔记历史版本"
            >
                <View style={{ maxHeight: 520, flexShrink: 1 }}>
                    <View className="flex-row items-center justify-between px-3 pt-2">
                        {level === "list" ? (
                            <View className="h-10 w-10" />
                        ) : (
                            <IconButton
                                icon={ChevronLeft}
                                size="compact"
                                accessibilityLabel="返回上一级历史"
                                disabled={restoring}
                                onPress={back}
                            />
                        )}
                        <Text
                            accessibilityRole="header"
                            className="text-text-primary text-base font-semibold"
                        >
                            {level === "list"
                                ? "历史版本"
                                : level === "detail"
                                  ? "版本详情"
                                  : "恢复此版本？"}
                        </Text>
                        <IconButton
                            icon={X}
                            size="compact"
                            accessibilityLabel="关闭历史版本"
                            disabled={restoring}
                            onPress={close}
                        />
                    </View>
                    <ScrollView
                        style={{ flexGrow: 0, flexShrink: 1 }}
                        contentContainerStyle={{
                            padding: 16,
                            gap: 12,
                            minHeight: 192,
                        }}
                        showsVerticalScrollIndicator
                        nestedScrollEnabled
                    >
                        {visible && history.loading && (
                            <NoteHistoryLoading
                                key={level}
                                label={
                                    level === "list"
                                        ? "正在读取历史版本…"
                                        : "正在读取版本内容…"
                                }
                            />
                        )}
                        {!!error && (
                            <Text
                                accessibilityRole="alert"
                                className="text-sm text-hyper-error"
                            >
                                {error}
                            </Text>
                        )}
                        {level === "list" && history.snapshot && (
                            <>
                                <Text className="text-xs text-text-secondary">
                                    笔记创建于：
                                    {formatNoteHistoryTime(
                                        history.snapshot.note.created_at,
                                    ) ?? "时间未知"}
                                </Text>
                                <Text className="text-xs text-text-secondary">
                                    历史仅保存在本机；自动草稿不在此列表中。
                                </Text>
                                {history.snapshot.revisions.length === 0 && (
                                    <Text className="text-sm text-text-secondary">
                                        暂无历史版本
                                    </Text>
                                )}
                                {history.snapshot.revisions.map((revision) => (
                                    <Pressable
                                        key={revision.revision_id}
                                        accessibilityRole="button"
                                        accessibilityLabel={`${revision.title}，${formatTime(revision.created_at)}，${ORIGIN_LABELS[revision.origin]}${revision.revision_id === history.snapshot?.note.current_revision_id ? "，当前版本" : ""}`}
                                        onPress={() => {
                                            setLevel("detail");
                                            setRestoreError("");
                                            void history.select(
                                                revision.revision_id,
                                            );
                                        }}
                                        className="min-h-14 flex-row items-center gap-2 rounded-control bg-surface-muted p-3 active:opacity-[0.85]"
                                    >
                                        <View className="flex-1 gap-1">
                                            <Text
                                                numberOfLines={1}
                                                className="text-text-primary text-sm"
                                            >
                                                {revision.title || "未命名笔记"}
                                            </Text>
                                            <Text className="text-xs text-text-secondary">
                                                {formatTime(
                                                    revision.created_at,
                                                )}
                                            </Text>
                                            <Text className="text-xs text-text-secondary">
                                                {ORIGIN_LABELS[revision.origin]}{" "}
                                                · {revision.content_length} 字
                                                {revision.revision_id ===
                                                history.snapshot?.note
                                                    .current_revision_id
                                                    ? " · 当前版本"
                                                    : ""}
                                            </Text>
                                        </View>
                                        <ChevronRight
                                            size={18}
                                            color={colors.textSecondary}
                                        />
                                    </Pressable>
                                ))}
                            </>
                        )}
                        {visible &&
                            level === "detail" &&
                            !history.loading &&
                            selected && (
                                <>
                                    <Text className="text-xs text-text-secondary">
                                        {`${formatTime(selected.created_at)} · ${ORIGIN_LABELS[selected.origin]}`}
                                    </Text>
                                    <Text className="text-xs text-text-secondary">
                                        历史全文
                                    </Text>
                                    <Text
                                        selectable
                                        className="text-text-primary text-lg font-semibold"
                                    >
                                        {selected.title || "未命名笔记"}
                                    </Text>
                                    <Text className="text-xs text-text-secondary">
                                        {categoryName(selected.category_id)}
                                    </Text>
                                    <Text
                                        selectable
                                        className="text-text-primary text-sm leading-6"
                                    >
                                        {selected.content || "（空正文）"}
                                    </Text>
                                </>
                            )}
                        {level === "confirm" && selected && (
                            <>
                                <Text className="text-text-primary text-sm leading-6">
                                    当前未保存的改动会先保留为一个版本，再恢复所选内容。
                                </Text>
                                <Text className="text-sm leading-6 text-text-secondary">
                                    恢复会生成新版本；历史分类若已删除，则使用默认分类。联网且允许云存储后自动同步。
                                </Text>
                                <Text className="text-xs text-text-secondary">
                                    所选版本：{formatTime(selected.created_at)}
                                </Text>
                            </>
                        )}
                        {!!restoreBlockedReason && level !== "list" && (
                            <Text className="text-sm text-hyper-error">
                                {restoreBlockedReason}
                            </Text>
                        )}
                    </ScrollView>
                    <View className="gap-2.5 px-4 pb-4">
                        {!!history.error && (
                            <DialogButton
                                label="刷新历史列表"
                                variant="secondary"
                                onPress={() => {
                                    setLevel("list");
                                    void history.refresh();
                                }}
                            />
                        )}
                        {level === "detail" && (
                            <DialogButton
                                label="查看正文对比"
                                variant="secondary"
                                disabled={history.loading || !selected}
                                onPress={compare}
                            />
                        )}
                        {level === "detail" && (
                            <DialogButton
                                label={
                                    isCurrent ? "已是当前版本" : "恢复此版本"
                                }
                                disabled={
                                    history.loading ||
                                    !selected ||
                                    isCurrent ||
                                    !!restoreBlockedReason
                                }
                                onPress={() => {
                                    if (
                                        selected &&
                                        !history.loading &&
                                        !isCurrent &&
                                        !restoreBlockedReason
                                    )
                                        setLevel("confirm");
                                }}
                            />
                        )}
                        {level === "confirm" && (
                            <View className="flex-row gap-2.5">
                                <DialogButton
                                    label="取消"
                                    variant="secondary"
                                    className="flex-1"
                                    disabled={restoring}
                                    onPress={back}
                                />
                                <DialogButton
                                    label={restoring ? "正在恢复" : "确认恢复"}
                                    leading={
                                        restoring ? (
                                            <ActivityIndicator
                                                size="small"
                                                color={
                                                    semanticColors.onBrandPrimary
                                                }
                                                accessibilityLabel="正在恢复历史版本"
                                            />
                                        ) : undefined
                                    }
                                    className="flex-1"
                                    disabled={
                                        restoring || !!restoreBlockedReason
                                    }
                                    onPress={() => void restore()}
                                />
                            </View>
                        )}
                        {!!restoreError && (
                            <DialogButton
                                label="刷新历史列表"
                                variant="text"
                                disabled={restoring}
                                onPress={() => {
                                    setRestoreError("");
                                    setLevel("list");
                                    void history.refresh();
                                }}
                            />
                        )}
                    </View>
                </View>
            </AnchoredPopover>
        </>
    );
}

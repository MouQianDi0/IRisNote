import { colors, semanticColors } from "@/shared/theme";
import { AnchoredPopover, IconButton } from "@/shared/ui";
import { DialogButton } from "@/shared/ui/Dialog/dialog";
import { ChevronLeft, ChevronRight, History, X } from "lucide-react-native";
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
import NoteHistoryDiff from "./note-history-diff";
import NoteHistoryLoading from "./note-history-loading";

type HistoryLevel = "list" | "detail" | "confirm";
type Props = {
    owner: number;
    noteId: number;
    currentValue: NoteDraftValue;
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

/** 复用统计菜单的锚点气泡；列表、详情、确认只切换气泡内容，不触发路由离开保存。 */
export default function NoteHistoryPopover({
    owner,
    noteId,
    currentValue,
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
    const [visible, setVisible] = useState(false);
    const [level, setLevel] = useState<HistoryLevel>("list");
    const [detailTab, setDetailTab] = useState<"diff" | "full">("diff");
    const [restoring, setRestoring] = useState(false);
    const [restoreError, setRestoreError] = useState("");

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            if (cooldown.current) clearTimeout(cooldown.current);
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
        }, 300);
    };
    const open = () => {
        if (disabled || openingLocked.current) return;
        openingLocked.current = true;
        onOpen();
        setLevel("list");
        setDetailTab("diff");
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

    return (
        <>
            <View ref={anchorRef} collapsable={false}>
                <IconButton
                    icon={History}
                    size="compact"
                    accessibilityLabel="查看历史版本"
                    accessibilityState={{ expanded: visible }}
                    disabled={disabled}
                    onPress={open}
                />
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
                    {level === "detail" && (
                        <View className="mx-4 mt-2 flex-row gap-2">
                            {(["diff", "full"] as const).map((tab) => (
                                <Pressable
                                    key={tab}
                                    accessibilityRole="button"
                                    accessibilityLabel={
                                        tab === "diff"
                                            ? "查看与当前对比"
                                            : "查看历史全文"
                                    }
                                    accessibilityState={{
                                        selected: detailTab === tab,
                                    }}
                                    onPress={() => setDetailTab(tab)}
                                    className="min-h-11 flex-1 items-center justify-center rounded-control"
                                    style={{
                                        backgroundColor:
                                            detailTab === tab
                                                ? semanticColors.surfaceListSelected
                                                : semanticColors.surfaceControl,
                                    }}
                                >
                                    <Text
                                        className={`text-sm ${detailTab === tab ? "text-primary" : "text-text-secondary"}`}
                                    >
                                        {tab === "diff"
                                            ? "与当前对比"
                                            : "历史全文"}
                                    </Text>
                                </Pressable>
                            ))}
                        </View>
                    )}
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
                                            setDetailTab("diff");
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
                                    <View
                                        style={{
                                            display:
                                                detailTab === "diff"
                                                    ? "flex"
                                                    : "none",
                                        }}
                                        accessibilityElementsHidden={
                                            detailTab !== "diff"
                                        }
                                        importantForAccessibility={
                                            detailTab === "diff"
                                                ? "auto"
                                                : "no-hide-descendants"
                                        }
                                    >
                                        <NoteHistoryDiff
                                            key={selected.revision_id}
                                            selected={selected}
                                            currentValue={currentValue}
                                            categoryName={categoryName}
                                        />
                                    </View>
                                    {detailTab === "full" && (
                                        <>
                                            <Text
                                                selectable
                                                className="text-text-primary text-lg font-semibold"
                                            >
                                                {selected.title || "未命名笔记"}
                                            </Text>
                                            <Text className="text-xs text-text-secondary">
                                                {categoryName(
                                                    selected.category_id,
                                                )}
                                            </Text>
                                            <Text
                                                selectable
                                                className="text-text-primary text-sm leading-6"
                                            >
                                                {selected.content ||
                                                    "（空正文）"}
                                            </Text>
                                        </>
                                    )}
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

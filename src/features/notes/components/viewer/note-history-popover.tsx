import { colors } from "@/shared/theme";
import { AnchoredPopover, IconButton } from "@/shared/ui";
import { DialogButton } from "@/shared/ui/Dialog/dialog";
import { ChevronDown, ChevronRight, X } from "lucide-react-native";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
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

/** 时间锚点只展示版本列表；点击版本直接进入全文标注页，编辑页拥有快照和原恢复回调。 */
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
    const cooldown = useRef<ReturnType<typeof setTimeout> | null>(null);
    const openingLocked = useRef(false);
    const comparisonOpening = useRef(false);
    const comparisonToken = useRef<string | null>(null);
    const [visible, setVisible] = useState(false);
    const [navigationError, setNavigationError] = useState("");
    useEffect(
        () => () => {
            if (cooldown.current) clearTimeout(cooldown.current);
            releaseNoteHistoryComparison(comparisonToken.current);
        },
        [],
    );
    const close = () => {
        if (!visible) return;
        history.invalidate();
        setVisible(false);
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
        setNavigationError("");
        setVisible(true);
        void history.refresh();
    };
    const compare = (revisionId: string) => {
        if (
            disabled ||
            comparisonOpening.current ||
            history.loading ||
            !history.snapshot
        )
            return;
        comparisonOpening.current = true;
        try {
            releaseNoteHistoryComparison(comparisonToken.current);
            const token = createNoteHistoryComparison({
                owner,
                noteId,
                revisionId,
                currentValue,
                createdAt: history.snapshot.note.created_at,
                updatedAt: updatedAt ?? null,
                categories: history.snapshot.categories,
                expectedRevisionId:
                    history.snapshot.note.current_revision_id ?? null,
                restoreBlockedReason,
                onRestore,
            });
            comparisonToken.current = token;
            close();
            router.push({
                pathname: "/pages/note/history/[id]",
                params: { id: noteId, revisionId, token },
            });
        } catch {
            releaseNoteHistoryComparison(comparisonToken.current);
            comparisonToken.current = null;
            comparisonOpening.current = false;
            if (cooldown.current) clearTimeout(cooldown.current);
            cooldown.current = null;
            setVisible(true);
            setNavigationError("打开版本详情失败，当前编辑已保留，请重试");
        }
    };
    const error = navigationError || history.error;
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
                        <View className="h-10 w-10" />
                        <Text
                            accessibilityRole="header"
                            className="text-text-primary text-base font-semibold"
                        >
                            历史版本
                        </Text>
                        <IconButton
                            icon={X}
                            size="compact"
                            accessibilityLabel="关闭历史版本"
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
                        nestedScrollEnabled
                    >
                        {visible && history.loading && (
                            <NoteHistoryLoading label="正在读取历史版本…" />
                        )}
                        {!!error && (
                            <Text
                                accessibilityRole="alert"
                                className="text-sm text-hyper-error"
                            >
                                {error}
                            </Text>
                        )}
                        {history.snapshot && (
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
                                        accessibilityLabel={`${revision.title}，${formatNoteHistoryTime(revision.created_at) ?? "时间未知"}，${ORIGIN_LABELS[revision.origin]}${revision.revision_id === history.snapshot?.note.current_revision_id ? "，当前版本" : ""}`}
                                        disabled={disabled || history.loading}
                                        onPress={() =>
                                            compare(revision.revision_id)
                                        }
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
                                                {formatNoteHistoryTime(
                                                    revision.created_at,
                                                ) ?? "时间未知"}
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
                    </ScrollView>
                    {!!history.error && (
                        <View className="px-4 pb-4">
                            <DialogButton
                                label="刷新历史列表"
                                variant="secondary"
                                onPress={() => {
                                    setNavigationError("");
                                    void history.refresh();
                                }}
                            />
                        </View>
                    )}
                </View>
            </AnchoredPopover>
        </>
    );
}

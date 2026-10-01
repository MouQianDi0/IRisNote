import { semanticColors } from "@/shared/theme";
import {
    diffTextLines,
    textDiffSections,
    type TextDiffChunk,
    type TextDiffResult,
} from "@/shared/utils/text-diff";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import type { NoteDraftValue } from "../../data/note-draft.repository";
import type { NoteRevision } from "../../data/note-revision.repository";
import NoteHistoryLoading from "./note-history-loading";

type Props = {
    selected: NoteRevision;
    currentValue: NoteDraftValue;
    categoryName: (id: number | null) => string;
};
type Input = { revisionId: string; before: string; after: string };
type Completion = {
    input: Input;
    result: TextDiffResult | null;
    error: boolean;
};

function DiffChunk({ type, lines }: TextDiffChunk) {
    const changed = type !== "equal";
    const label = type === "delete" ? "删除" : "新增";
    const prefix = type === "delete" ? "− " : type === "insert" ? "+ " : "  ";
    const color =
        type === "delete" ? semanticColors.destructive : semanticColors.success;
    return (
        <Text
            selectable
            accessibilityLabel={
                changed
                    ? `${label}：${lines.map((line) => line || "空行").join("\n")}`
                    : undefined
            }
            className="text-text-primary text-sm leading-6"
            style={
                changed
                    ? {
                          color,
                          backgroundColor: `${color}12`,
                          borderLeftWidth: 3,
                          borderLeftColor: color,
                          paddingHorizontal: 6,
                          paddingVertical: 4,
                      }
                    : undefined
            }
        >
            {lines.map((line) => `${prefix}${line || "（空行）"}`).join("\n")}
        </Text>
    );
}

/** 计算在 effect 后分批推进；缓存本次结果，卸载/输入变化后旧任务不回写。 */
export default function NoteHistoryDiff({
    selected,
    currentValue,
    categoryName,
}: Props) {
    const input = useMemo(
        () => ({
            revisionId: selected.revision_id,
            before: selected.content ?? "",
            after: currentValue.content,
        }),
        [selected.revision_id, selected.content, currentValue.content],
    );
    const [completion, setCompletion] = useState<Completion | null>(null);
    const [retry, setRetry] = useState(0);
    const [expanded, setExpanded] = useState<{
        input: Input;
        ids: number[];
    } | null>(null);
    useEffect(() => {
        let cancelled = false;
        const task = diffTextLines(input.before, input.after);
        let timer: ReturnType<typeof setTimeout>;
        const advance = () => {
            if (cancelled) return;
            try {
                const step = task.next();
                if (step.done)
                    setCompletion({ input, result: step.value, error: false });
                else timer = setTimeout(advance, 0);
            } catch {
                setCompletion({ input, result: null, error: true });
            }
        };
        // 初次绘制先显示占位；批次间让出 JS 线程供动画、关闭等交互使用。
        timer = setTimeout(advance, 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            task.return({ status: "too-large" });
        };
    }, [input, retry]);
    const ready = completion?.input === input ? completion : null;
    const result = ready?.result;
    const sections = useMemo(
        () =>
            result?.status === "complete"
                ? textDiffSections(result.chunks)
                : [],
        [result],
    );
    const titleChanged = selected.title !== currentValue.title;
    const categoryChanged = selected.category_id !== currentValue.categoryId;
    if (!ready) return <NoteHistoryLoading key={retry} label="正在生成对比…" />;
    return (
        <View style={{ minHeight: 160 }} className="gap-3">
            <Text className="text-xs text-text-secondary">
                对比当前编辑，包含未保存改动
            </Text>
            {result?.status === "complete" && (
                <Text className="text-xs text-text-secondary">{`正文变化：新增 ${result.added} 行，删除 ${result.removed} 行`}</Text>
            )}
            {ready.error && (
                <>
                    <Text
                        accessibilityRole="alert"
                        className="text-sm text-hyper-error"
                    >
                        生成对比失败，请重试或查看历史全文
                    </Text>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="重新生成对比"
                        className="bg-surface-control min-h-11 items-center justify-center rounded-control"
                        onPress={() => {
                            setCompletion(null);
                            setRetry((value) => value + 1);
                        }}
                    >
                        <Text className="text-sm text-primary">
                            重新生成对比
                        </Text>
                    </Pressable>
                </>
            )}
            {titleChanged && (
                <View className="gap-1">
                    <Text className="text-xs text-text-secondary">标题</Text>
                    <DiffChunk
                        type="delete"
                        lines={[selected.title || "（空标题）"]}
                    />
                    <DiffChunk
                        type="insert"
                        lines={[currentValue.title || "（空标题）"]}
                    />
                </View>
            )}
            {categoryChanged && (
                <View className="gap-1">
                    <Text className="text-xs text-text-secondary">分类</Text>
                    <DiffChunk
                        type="delete"
                        lines={[categoryName(selected.category_id)]}
                    />
                    <DiffChunk
                        type="insert"
                        lines={[categoryName(currentValue.categoryId)]}
                    />
                </View>
            )}
            {result?.status === "too-large" && (
                <Text className="text-sm text-text-secondary">
                    正文差异较大，请切换历史全文查看
                </Text>
            )}
            {result?.status === "complete" && (
                <>
                    {result.added === 0 && result.removed === 0 ? (
                        <Text className="text-sm text-text-secondary">
                            {titleChanged || categoryChanged
                                ? "正文无变化"
                                : "与当前内容一致"}
                        </Text>
                    ) : (
                        sections.map((section, index) => {
                            if (section.type !== "fold")
                                return <DiffChunk key={index} {...section} />;
                            const isExpanded =
                                expanded?.input === input &&
                                expanded.ids.includes(section.id);
                            return (
                                <View key={index} className="gap-1">
                                    <Pressable
                                        accessibilityRole="button"
                                        accessibilityLabel={`${isExpanded ? "收起" : "展开"}未改动 ${section.lines.length} 行`}
                                        accessibilityState={{
                                            expanded: isExpanded,
                                        }}
                                        className="min-h-11 items-center justify-center rounded-control bg-surface-muted"
                                        onPress={() =>
                                            setExpanded((previous) => {
                                                const ids =
                                                    previous?.input === input
                                                        ? previous.ids
                                                        : [];
                                                return {
                                                    input,
                                                    ids: ids.includes(
                                                        section.id,
                                                    )
                                                        ? ids.filter(
                                                              (id) =>
                                                                  id !==
                                                                  section.id,
                                                          )
                                                        : [...ids, section.id],
                                                };
                                            })
                                        }
                                    >
                                        <Text className="text-xs text-text-secondary">{`${isExpanded ? "收起" : "展开"}未改动 ${section.lines.length} 行`}</Text>
                                    </Pressable>
                                    {isExpanded && (
                                        <DiffChunk
                                            type="equal"
                                            lines={section.lines}
                                        />
                                    )}
                                </View>
                            );
                        })
                    )}
                </>
            )}
        </View>
    );
}

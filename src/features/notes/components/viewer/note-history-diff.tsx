import { semanticColors } from "@/shared/theme";
import {
    diffTextWithCharacters,
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
    retry: number;
    result: TextDiffResult | null;
    error: boolean;
};

function DiffChunk({ type, lines, spans }: TextDiffChunk) {
    const changed =
        type !== "equal" &&
        (!spans || spans.some((span) => span.type !== "equal"));
    const label = type === "delete" ? "删除" : "新增";
    const prefix = type === "delete" ? "− " : type === "insert" ? "+ " : "  ";
    const color =
        type === "delete" ? semanticColors.destructive : semanticColors.success;
    return (
        <Text
            selectable
            accessibilityLabel={
                changed
                    ? `${label}：${
                          spans
                              ? spans
                                    .filter((span) => span.type !== "equal")
                                    .map((span) =>
                                        describeCharacters(span.text),
                                    )
                                    .join("；")
                              : lines.map((line) => line || "空行").join("\n")
                      }`
                    : type === "equal"
                      ? undefined
                      : `${type === "delete" ? "历史" : "当前"}：${lines.join("\n")}`
            }
            className="text-text-primary text-sm leading-6"
            style={
                changed
                    ? {
                          ...(!spans
                              ? { color, backgroundColor: `${color}12` }
                              : {}),
                          borderLeftWidth: 3,
                          borderLeftColor: color,
                          paddingHorizontal: 6,
                          paddingVertical: 4,
                      }
                    : undefined
            }
        >
            {spans ? (
                <>
                    <Text style={changed ? { color } : undefined}>
                        {changed ? prefix : "  "}
                    </Text>
                    {spans.map((span, index) => (
                        <Text
                            key={index}
                            style={
                                span.type === "equal"
                                    ? undefined
                                    : {
                                          color,
                                          backgroundColor: `${color}20`,
                                          textDecorationLine:
                                              type === "delete"
                                                  ? "line-through"
                                                  : "underline",
                                      }
                            }
                        >
                            {span.type === "equal"
                                ? span.text
                                : visibleCharacters(span.text)}
                        </Text>
                    ))}
                </>
            ) : (
                lines.map((line) => `${prefix}${line || "（空行）"}`).join("\n")
            )}
        </Text>
    );
}

const visibleCharacters = (text: string) =>
    text
        .replace(/ /g, "·")
        .replace(/\t/g, "⇥")
        .replace(/\n/g, "↵\n")
        .replace(/\r/g, "␍");
const describeCharacters = (text: string) =>
    text
        .replace(/ /g, " 空格 ")
        .replace(/\t/g, " 制表符 ")
        .replace(/\n/g, " 换行 ")
        .replace(/\r/g, " 回车 ");

/** 正文、标题各自缓存和分批推进；输入变化/卸载后旧任务不回写。 */
function useCharacterComparison(input: Input, retry: number) {
    const [completion, setCompletion] = useState<Completion | null>(null);
    useEffect(() => {
        let cancelled = false;
        const task = diffTextWithCharacters(input.before, input.after);
        let timer: ReturnType<typeof setTimeout>;
        const advance = () => {
            if (cancelled) return;
            try {
                const step = task.next();
                if (step.done)
                    setCompletion({
                        input,
                        retry,
                        result: step.value,
                        error: false,
                    });
                else timer = setTimeout(advance, 0);
            } catch {
                setCompletion({ input, retry, result: null, error: true });
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
    return completion?.input === input && completion.retry === retry
        ? completion
        : null;
}

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
    const titleInput = useMemo(
        () => ({
            revisionId: selected.revision_id,
            before: selected.title,
            after: currentValue.title,
        }),
        [selected.revision_id, selected.title, currentValue.title],
    );
    const [retry, setRetry] = useState(0);
    const [expanded, setExpanded] = useState<{
        input: Input;
        ids: number[];
    } | null>(null);
    const ready = useCharacterComparison(input, retry);
    const titleReady = useCharacterComparison(titleInput, retry);
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
    if (!ready || !titleReady)
        return <NoteHistoryLoading key={retry} label="正在生成对比…" />;
    return (
        <View style={{ minHeight: 160 }} className="gap-3">
            <Text className="text-xs text-text-secondary">
                对比当前编辑，包含未保存改动
            </Text>
            {result?.status === "complete" && (
                <>
                    <Text className="text-xs text-text-secondary">{`正文变化：新增 ${result.added} 字符，删除 ${result.removed} 字符`}</Text>
                    {(result.added > 0 || result.removed > 0) && (
                        <Text className="text-xs text-text-secondary">
                            空格、换行也计入；· 空格，⇥ 制表符，↵ 换行
                        </Text>
                    )}
                </>
            )}
            {(ready.error || titleReady.error) && (
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
                    {titleReady.result?.status === "complete" &&
                        titleReady.result.chunks.map((chunk, index) => (
                            <DiffChunk key={index} {...chunk} />
                        ))}
                    {titleReady.result?.status === "too-large" && (
                        <Text className="text-sm text-text-secondary">
                            标题差异较大，请切换历史全文查看
                        </Text>
                    )}
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

import { semanticColors } from "@/shared/theme";
import {
    diffTextWithCharacters,
    type CharacterTextDiffResult,
    type TextDiffSpan,
} from "@/shared/utils/text-diff";
import { useEffect, useMemo, useState } from "react";
import { FlatList, Pressable, Switch, Text, View } from "react-native";
import type { NoteDraftValue } from "../../data/note-draft.repository";
import type { NoteRevision } from "../../data/note-revision.repository";
import {
    historyDiffRows,
    type HistoryDiffRow,
} from "../../utils/note-history-diff-rows";
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
    result: CharacterTextDiffResult | null;
    error: boolean;
};
const describeCharacters = (text: string) =>
    text
        .replace(/ /g, " 空格 ")
        .replace(/\t/g, " 制表符 ")
        .replace(/\n/g, " 换行 ")
        .replace(/\r/g, " 回车 ");
const visibleCharacters = (text: string) =>
    text
        .replace(/ /g, "·")
        .replace(/\t/g, "⇥")
        .replace(/\n/g, "↵")
        .replace(/\r/g, "␍");

/** 同一段正文内交错标注，共有文字只有一份；换行由段落布局承担。 */
function AnnotatedText({ spans }: { spans: TextDiffSpan[] }) {
    return (
        <Text
            selectable
            className="text-text-primary text-sm leading-6"
            style={{ minHeight: 24 }}
        >
            {spans.map((span, index) => (
                <Text
                    key={index}
                    accessibilityLabel={
                        span.type === "equal"
                            ? undefined
                            : `${span.type === "delete" ? "删除" : "新增"}：${describeCharacters(span.text)}`
                    }
                    style={
                        span.type === "equal"
                            ? undefined
                            : {
                                  color:
                                      span.type === "delete"
                                          ? semanticColors.destructive
                                          : semanticColors.success,
                                  backgroundColor: `${span.type === "delete" ? semanticColors.destructive : semanticColors.success}20`,
                                  textDecorationLine:
                                      span.type === "delete"
                                          ? "line-through"
                                          : "underline",
                              }
                    }
                >
                    {span.type === "equal"
                        ? span.text.replace(/\n$/, "")
                        : visibleCharacters(span.text)}
                </Text>
            ))}
        </Text>
    );
}

/** 正文、标题分别缓存；输入/重试改变立即隐藏旧结果，卸载取消生成器。 */
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
                        result: step.value ?? null,
                        error: !step.value,
                    });
                else timer = setTimeout(advance, 0);
            } catch {
                setCompletion({ input, retry, result: null, error: true });
            }
        };
        timer = setTimeout(advance, 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
            task.return(undefined);
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
    const [display, setDisplay] = useState<{
        revisionId: string;
        marked: boolean;
    } | null>(null);
    const marked =
        display?.revisionId === selected.revision_id ? display.marked : true;
    const ready = useCharacterComparison(input, retry);
    const titleReady = useCharacterComparison(titleInput, retry);
    const result = ready?.result;
    const bodySpans = useMemo<TextDiffSpan[]>(
        () =>
            marked && result?.status === "complete"
                ? result.spans
                : [
                      {
                          type: "equal",
                          text: input.before.replace(/\r\n/g, "\n"),
                      },
                  ],
        [marked, result, input],
    );
    const rows = useMemo(() => historyDiffRows(bodySpans), [bodySpans]);
    const titleSpans: TextDiffSpan[] =
        marked &&
        titleReady?.result?.status === "complete" &&
        titleReady.result.spans.length > 0
            ? titleReady.result.spans
            : [{ type: "equal", text: selected.title || "未命名笔记" }];
    const titleChanged = selected.title !== currentValue.title;
    const categoryChanged = selected.category_id !== currentValue.categoryId;
    const failed = ready?.error || titleReady?.error;
    const empty = bodySpans.every((span) => !span.text);
    const header = (
        <View className="gap-3 pb-4">
            <Text className="text-xs text-text-secondary">
                对比当前编辑，包含未保存改动
            </Text>
            {result?.status === "complete" && (
                <Text className="text-xs text-text-secondary">{`正文变化：${result.changes} 处，新增 ${result.added} 字符，删除 ${result.removed} 字符`}</Text>
            )}
            <View className="min-h-11 flex-row items-center justify-between">
                <Text className="text-sm text-text-secondary">差异标注</Text>
                <Switch
                    accessibilityLabel="差异标注"
                    value={marked}
                    onValueChange={(value) =>
                        setDisplay({
                            revisionId: selected.revision_id,
                            marked: value,
                        })
                    }
                    trackColor={{ true: semanticColors.brandPrimary }}
                />
            </View>
            {marked && (!ready || !titleReady) && (
                <NoteHistoryLoading key={retry} compact label="正在标注差异…" />
            )}
            {marked && (
                <Text className="text-xs text-text-secondary">
                    红色删除线为删除，绿色下划线为新增；· 空格，⇥ 制表符，↵ 换行
                </Text>
            )}
            {failed && (
                <>
                    <Text
                        accessibilityRole="alert"
                        className="text-sm text-hyper-error"
                    >
                        生成对比失败，历史全文已保留，请重试
                    </Text>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="重新生成对比"
                        className="bg-surface-control min-h-11 items-center justify-center rounded-control"
                        onPress={() => setRetry((value) => value + 1)}
                    >
                        <Text className="text-sm text-primary">
                            重新生成对比
                        </Text>
                    </Pressable>
                </>
            )}
            <AnnotatedText spans={titleSpans} />
            <Text className="text-xs text-text-secondary">
                {marked && categoryChanged
                    ? `分类：${categoryName(selected.category_id)} → ${categoryName(currentValue.categoryId)}`
                    : categoryName(selected.category_id)}
            </Text>
            {result?.status === "complete" &&
                result.added === 0 &&
                result.removed === 0 && (
                    <Text className="text-sm text-text-secondary">
                        {titleChanged || categoryChanged
                            ? "正文无变化"
                            : "与当前内容一致"}
                    </Text>
                )}
            {empty && (
                <Text className="text-sm text-text-secondary">（空正文）</Text>
            )}
        </View>
    );
    return (
        <FlatList
            data={empty ? [] : rows}
            keyExtractor={(item) => item.key}
            renderItem={({ item }: { item: HistoryDiffRow }) => (
                <AnnotatedText spans={item.spans} />
            )}
            ListHeaderComponent={header}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32 }}
            initialNumToRender={24}
            maxToRenderPerBatch={24}
            windowSize={7}
        />
    );
}

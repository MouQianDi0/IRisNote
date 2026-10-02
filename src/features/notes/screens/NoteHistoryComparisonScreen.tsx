import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import { useApplicationDatabase } from "@/core/database";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { PageHeader, Screen } from "@/shared/ui";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import NoteHistoryDiff from "../components/viewer/note-history-diff";
import NoteHistoryLoading from "../components/viewer/note-history-loading";
import type { NoteRevision } from "../data/note-revision.repository";
import {
    readNoteHistoryComparison,
    type NoteHistoryComparisonSession,
} from "../services/note-history-comparison-session";
import { readHistoryRevision } from "../services/note-history.service";
import {
    formatNoteHistoryTime,
    noteEditTimeLabel,
} from "../utils/note-history-time";

const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;

/** 编辑页留在栈内，既有 blur 只落盘草稿；此页不建立第二个编辑会话或提交版本。 */
export default function NoteHistoryComparisonScreen() {
    const database = useApplicationDatabase();
    const { user } = useAuth();
    const { ownerUserId } = useCloudStorage();
    const params = useLocalSearchParams<{
        id?: string | string[];
        revisionId?: string | string[];
        token?: string | string[];
    }>();
    const rawId = first(params.id);
    const numericId = Number(rawId);
    const noteId =
        rawId && Number.isSafeInteger(numericId) && numericId !== 0
            ? numericId
            : null;
    const token = first(params.token);
    const revisionId = first(params.revisionId);
    const session =
        user?.id === ownerUserId
            ? readNoteHistoryComparison(
                  token,
                  user?.id ?? null,
                  noteId,
                  revisionId,
              )
            : null;
    const [completion, setCompletion] = useState<{
        session: NoteHistoryComparisonSession;
        attempt: number;
        revision: NoteRevision | null;
        error: string;
    } | null>(null);
    const [attempt, setAttempt] = useState(0);
    const [tab, setTab] = useState<"diff" | "full">("diff");

    useEffect(() => {
        if (!session) return;
        let cancelled = false;
        const isCurrent = () =>
            !cancelled &&
            readNoteHistoryComparison(
                token,
                session.owner,
                session.noteId,
                revisionId,
            ) === session;
        void readHistoryRevision(
            database,
            session.owner,
            session.noteId,
            session.revisionId,
        )
            .then((revision) => {
                if (isCurrent())
                    setCompletion({ session, attempt, revision, error: "" });
            })
            .catch((cause: unknown) => {
                if (isCurrent())
                    setCompletion({
                        session,
                        attempt,
                        revision: null,
                        error:
                            cause instanceof Error
                                ? cause.message
                                : "读取历史版本失败，请重试",
                    });
            });
        return () => {
            cancelled = true;
        };
    }, [database, session, token, revisionId, attempt]);

    const ready =
        completion?.session === session && completion.attempt === attempt
            ? completion
            : null;
    const selected = ready?.revision;
    const categoryName = (id: number | null) =>
        id === null
            ? "默认分类"
            : (session?.categories.find((category) => category.id === id)
                  ?.name ?? "分类已不可用");
    const back = () => {
        if (router.canGoBack()) router.back();
        else router.replace("/note");
    };

    return (
        <Screen variant="surface">
            <View className="px-4">
                <PageHeader
                    title="正文对比"
                    backLabel="返回笔记编辑页"
                    onBack={back}
                />
            </View>
            {!session ? (
                <Text
                    accessibilityRole="alert"
                    className="px-5 py-4 text-sm text-text-secondary"
                >
                    对比内容已过期，请返回笔记编辑页重新打开
                </Text>
            ) : !ready ? (
                <View className="px-5 py-4">
                    <NoteHistoryLoading label="正在读取版本内容…" />
                </View>
            ) : ready.error ? (
                <View className="gap-2 px-5 py-4">
                    <Text
                        accessibilityRole="alert"
                        className="text-sm text-hyper-error"
                    >
                        {ready.error}
                    </Text>
                    <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="重新读取历史版本"
                        className="bg-surface-control min-h-11 items-center justify-center rounded-control"
                        onPress={() => setAttempt((value) => value + 1)}
                    >
                        <Text className="text-sm text-primary">重试</Text>
                    </Pressable>
                </View>
            ) : (
                selected && (
                    <>
                        <View className="gap-1 px-5 pb-3">
                            <Text className="text-xs text-text-secondary">
                                历史版本：
                                {formatNoteHistoryTime(selected.created_at) ??
                                    "时间未知"}
                            </Text>
                            <Text className="text-xs text-text-secondary">
                                {noteEditTimeLabel(session.updatedAt)}
                            </Text>
                            <Text className="text-xs text-text-secondary">
                                笔记创建于：
                                {formatNoteHistoryTime(session.createdAt) ??
                                    "时间未知"}
                            </Text>
                            <View className="mt-2 flex-row gap-2">
                                {(["diff", "full"] as const).map((value) => (
                                    <Pressable
                                        key={value}
                                        accessibilityRole="button"
                                        accessibilityLabel={
                                            value === "diff"
                                                ? "查看与当前对比"
                                                : "查看历史全文"
                                        }
                                        accessibilityState={{
                                            selected: tab === value,
                                        }}
                                        className="bg-surface-control min-h-11 flex-1 items-center justify-center rounded-control"
                                        onPress={() => setTab(value)}
                                    >
                                        <Text
                                            className={
                                                tab === value
                                                    ? "text-sm text-primary"
                                                    : "text-sm text-text-secondary"
                                            }
                                        >
                                            {value === "diff"
                                                ? "与当前对比"
                                                : "历史全文"}
                                        </Text>
                                    </Pressable>
                                ))}
                            </View>
                        </View>
                        <View
                            style={{
                                flex: 1,
                                display: tab === "diff" ? "flex" : "none",
                            }}
                            accessibilityElementsHidden={tab !== "diff"}
                            importantForAccessibility={
                                tab === "diff" ? "auto" : "no-hide-descendants"
                            }
                        >
                            <NoteHistoryDiff
                                key={selected.revision_id}
                                selected={selected}
                                currentValue={session.currentValue}
                                categoryName={categoryName}
                            />
                        </View>
                        {tab === "full" && (
                            <ScrollView
                                contentContainerStyle={{
                                    paddingHorizontal: 20,
                                    paddingBottom: 32,
                                    gap: 12,
                                }}
                            >
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
                            </ScrollView>
                        )}
                    </>
                )
            )}
        </Screen>
    );
}

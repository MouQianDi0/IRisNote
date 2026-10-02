import { useCloudStorage } from "@/core/cloud-storage/cloud-storage-provider";
import { captureLocalStorageAccess } from "@/core/cloud-storage/cloud-storage-policy";
import { useApplicationDatabase } from "@/core/database";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { PageHeader, Screen } from "@/shared/ui";
import { DraftDialog, DialogButton } from "@/shared/ui/Dialog/dialog";
import { router, useLocalSearchParams } from "expo-router";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { semanticColors } from "@/shared/theme";
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

/** 列表直达全文标注与恢复；恢复复用原编辑页的草稿锁，不建立第二个编辑会话。 */
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
    const [confirmation, setConfirmation] =
        useState<NoteHistoryComparisonSession | null>(null);
    const [restoring, setRestoring] = useState(false);
    const [restoreError, setRestoreError] = useState("");
    const busy = useRef(false);
    const restored = useRef(false);
    const mounted = useRef(true);
    const navigation = useNavigation();
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    usePreventRemove(restoring, ({ data }) => {
        // 与草稿退出保护一致：成功后允许本次返回，事务期间拦住系统返回/手势。
        if (restored.current) navigation.dispatch(data.action);
    });

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
        if (busy.current) return;
        if (router.canGoBack()) router.back();
        else router.replace("/note");
    };
    const isCurrent = selected?.revision_id === session?.expectedRevisionId;
    const blocked =
        !selected || !session || isCurrent || !!session.restoreBlockedReason;
    const closeConfirmation = () => {
        if (!busy.current) setConfirmation(null);
    };
    const restore = async () => {
        if (
            busy.current ||
            blocked ||
            !session ||
            !selected ||
            confirmation !== session ||
            readNoteHistoryComparison(
                token,
                session.owner,
                session.noteId,
                revisionId,
            ) !== session
        )
            return;
        busy.current = true;
        restored.current = false;
        setRestoring(true);
        setRestoreError("");
        try {
            const checkAccess = captureLocalStorageAccess(session.owner);
            await session.onRestore(
                selected.revision_id,
                session.expectedRevisionId,
            );
            checkAccess();
            if (mounted.current) {
                // 原恢复成功会重建编辑会话并释放快照；此处不能再用 token 判断成功。
                restored.current = true;
                busy.current = false;
                setRestoring(false);
                setConfirmation(null);
                back();
            }
        } catch (cause) {
            if (
                mounted.current &&
                readNoteHistoryComparison(
                    token,
                    session.owner,
                    session.noteId,
                    revisionId,
                ) === session
            )
                setRestoreError(
                    cause instanceof Error
                        ? cause.message
                        : "恢复失败，当前编辑已保留，请重试",
                );
        } finally {
            busy.current = false;
            if (mounted.current) setRestoring(false);
        }
    };

    return (
        <Screen variant="surface">
            <View className="px-4">
                <PageHeader
                    title="版本详情"
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
                        </View>
                        <NoteHistoryDiff
                            key={selected.revision_id}
                            selected={selected}
                            currentValue={session.currentValue}
                            categoryName={categoryName}
                        />
                        <View className="gap-2 px-5 pb-4">
                            {!!session.restoreBlockedReason && (
                                <Text className="text-sm text-hyper-error">
                                    {session.restoreBlockedReason}
                                </Text>
                            )}
                            <DialogButton
                                label={
                                    isCurrent ? "已是当前版本" : "恢复此版本"
                                }
                                disabled={blocked || restoring}
                                onPress={() => {
                                    if (!blocked && !busy.current) {
                                        setRestoreError("");
                                        setConfirmation(session);
                                    }
                                }}
                            />
                        </View>
                    </>
                )
            )}
            <DraftDialog
                visible={!!session && confirmation === session}
                title="恢复此版本？"
                onClose={closeConfirmation}
                closeOnScrimTap={!restoring}
            >
                <Text className="text-text-primary text-sm leading-6">
                    当前未保存的改动会先保留为一个版本，再恢复所选内容。
                </Text>
                <Text className="mt-2 text-sm leading-6 text-text-secondary">
                    恢复会生成新版本；历史分类若已删除，则使用默认分类。联网且允许云存储后自动同步。
                </Text>
                {!!restoreError && (
                    <Text
                        accessibilityRole="alert"
                        className="mt-2 text-sm text-hyper-error"
                    >
                        {restoreError}
                    </Text>
                )}
                <View className="mt-4 flex-row gap-2.5">
                    <DialogButton
                        label="取消"
                        variant="secondary"
                        className="flex-1"
                        disabled={restoring}
                        onPress={closeConfirmation}
                    />
                    <DialogButton
                        label={restoring ? "正在恢复" : "确认恢复"}
                        className="flex-1"
                        disabled={restoring || blocked}
                        leading={
                            restoring ? (
                                <ActivityIndicator
                                    size="small"
                                    color={semanticColors.onBrandPrimary}
                                    accessibilityLabel="正在恢复历史版本"
                                />
                            ) : undefined
                        }
                        onPress={() => void restore()}
                    />
                </View>
            </DraftDialog>
        </Screen>
    );
}

import { useApplicationDatabase } from "@/core/database";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";
import {
    draftSnapshot,
    draftValue,
    noteDraftValue,
    openNoteDraft,
    rebaseNoteDraft,
    readNoteDraft,
    writeNoteDraft,
    type NoteDraft,
    type NoteDraftValue,
} from "../data/note-draft.repository";
import { getLocalNoteByClientId } from "../data/note-local.repository";
import {
    NoteDraftSession,
    type DraftWriteState,
} from "../services/note-draft-session";
import { registerActiveDraftFlush } from "../services/active-draft-flush";
import type { Note } from "../notes.types";

type DraftResource = {
    row: NoteDraft;
    session: NoteDraftSession;
    initial: NoteDraftValue;
    current: NoteDraftValue;
    conflict: boolean;
};

export type NoteDraftSaveSnapshot = {
    value: NoteDraftValue;
    sequence: number;
    target: Note | undefined;
    commit: {
        key: string;
        sessionId: string;
        sequence: number;
    };
};

export type NoteDraftLeaveResult = {
    afterLeave?: () => void;
};

type NoteDraftOptions = {
    beforeLeave?: (
        snapshot: NoteDraftSaveSnapshot,
    ) => Promise<NoteDraftLeaveResult | void>;
};

export function useNoteDraft(
    owner: number,
    key: string,
    note: Note | undefined,
    initial: NoteDraftValue,
    options: NoteDraftOptions = {},
) {
    const database = useApplicationDatabase();
    const navigation = useNavigation();
    // 调用方按账户和笔记 ID 设置 key；输入或分类变化不能重新初始化会话。
    const [seed] = useState({ owner, key, note, initial });
    const [resource, setResource] = useState<DraftResource | null>(null);
    const [state, setState] = useState<DraftWriteState>("idle");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);
    const [reload, setReload] = useState(0);
    const active = useRef<DraftResource | null>(null);
    const busy = useRef(false);
    const complete = useRef(false);

    useEffect(() => {
        let disposed = false;
        let session: NoteDraftSession | undefined;
        let unregisterUpdateFlush: (() => void) | undefined;
        async function initialize() {
            const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
            const latestNote = seed.note
                ? await getLocalNoteByClientId(
                      database,
                      seed.owner,
                      seed.note.id,
                  )
                : null;
            if (disposed) return;
            const initialValue = latestNote
                ? noteDraftValue(latestNote)
                : seed.initial;
            const row = await openNoteDraft(
                database,
                seed.owner,
                seed.key,
                id,
                seed.note?.id ?? null,
                initialValue,
                latestNote?.current_revision_id ?? null,
            );
            if (disposed) return;
            const currentNote =
                row.note_id === null
                    ? null
                    : await getLocalNoteByClientId(
                          database,
                          seed.owner,
                          row.note_id,
                      );
            if (disposed) return;
            const current = currentNote
                ? noteDraftValue(currentNote)
                : initialValue;
            // 基础版本优先判定冲突；迁移前旧草稿退回内容快照比对。
            const baseRevisionStale =
                row.note_id !== null &&
                row.base_revision_id !== null &&
                row.base_revision_id !==
                    (currentNote?.current_revision_id ?? null);
            const conflict =
                row.note_id !== null &&
                ((!currentNote && row.note_id !== seed.note?.id) ||
                    baseRevisionStale ||
                    (row.base_revision_id === null &&
                        row.base_snapshot !== draftSnapshot(current)));
            session = new NoteDraftSession(
                draftValue(row),
                row.sequence,
                (value, sequence) =>
                    writeNoteDraft(
                        database,
                        seed.owner,
                        { key: seed.key, sessionId: id, sequence },
                        value,
                    ),
                (nextState, cause) => {
                    if (disposed) return;
                    setState(nextState);
                    setError(
                        cause instanceof Error
                            ? cause.message
                            : cause
                              ? "草稿写入失败，请重试"
                              : "",
                    );
                },
            );
            const next = {
                row,
                session,
                initial: draftValue(row),
                current,
                conflict,
            };
            active.current = next;
            unregisterUpdateFlush = registerActiveDraftFlush(async () => {
                if (!disposed && busy.current)
                    throw new Error("笔记正在保存，请稍后重试安装");
                await session?.flush();
            });
            complete.current = false;
            busy.current = false;
            setError("");
            setState(row.sequence > 0 ? "saved" : "idle");
            setSaving(false);
            setResource(next);
        }
        void initialize().catch((cause: unknown) => {
            if (!disposed)
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "读取草稿失败，请重试",
                );
        });
        return () => {
            disposed = true;
            unregisterUpdateFlush?.();
            active.current = null;
            void session?.close().catch(() => {
                console.warn("[Note draft] 页面卸载补写失败", {
                    owner: seed.owner,
                    key: seed.key,
                });
            });
        };
    }, [database, seed, reload]);

    const flush = useCallback(async () => {
        await active.current?.session.flush();
    }, []);
    const requestFlush = useCallback(() => {
        void flush().catch(() => undefined);
    }, [flush]);

    useEffect(() => {
        const subscription = AppState.addEventListener("change", (next) => {
            if (next !== "active") requestFlush();
        });
        const unsubscribe = navigation.addListener("blur", requestFlush);
        if (Platform.OS !== "web" || typeof window === "undefined") {
            return () => {
                subscription.remove();
                unsubscribe();
            };
        }
        const onVisibility = () => {
            if (document.visibilityState === "hidden") requestFlush();
        };
        const onUnload = (event: BeforeUnloadEvent) => {
            if (active.current?.session.dirty || busy.current) {
                requestFlush();
                event.preventDefault();
                event.returnValue = "";
            }
        };
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("pagehide", requestFlush);
        window.addEventListener("beforeunload", onUnload);
        return () => {
            subscription.remove();
            unsubscribe();
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("pagehide", requestFlush);
            window.removeEventListener("beforeunload", onUnload);
        };
    }, [navigation, requestFlush]);

    const beginSave = async (): Promise<NoteDraftSaveSnapshot> => {
        const current = active.current;
        if (!current || busy.current) throw new Error("草稿会话尚未准备完成");
        if (current.conflict)
            throw new Error("已保存内容发生变化，草稿已保留，请先核对内容");
        busy.current = true;
        setSaving(true);
        try {
            const snapshot = await current.session.beginSave();
            const row = await readNoteDraft(database, owner, key);
            if (!row || row.session_id !== current.row.session_id)
                throw new Error("草稿会话已变化，请重新打开");
            const target =
                row.note_id === null
                    ? undefined
                    : ((await getLocalNoteByClientId(
                          database,
                          owner,
                          row.note_id,
                      )) ?? seed.note);
            if (row.note_id !== null && !target)
                throw new Error("原笔记已不存在，草稿已保留");
            return {
                ...snapshot,
                target,
                commit: {
                    key,
                    sessionId: current.row.session_id,
                    sequence: snapshot.sequence,
                },
            };
        } catch (cause) {
            current.session.endSave();
            busy.current = false;
            setSaving(false);
            throw cause;
        }
    };

    const endSave = (saved: boolean) => {
        complete.current = saved;
        if (saved) {
            // 正式保存已清理当前草稿；合并编辑页继续停留时重新建立空会话。
            active.current?.session.abandon();
            active.current = null;
            busy.current = false;
            setSaving(false);
            setResource(null);
            setReload((value) => value + 1);
            return;
        }
        active.current?.session.endSave();
        busy.current = false;
        setSaving(false);
    };

    const confirmConflict = async () => {
        const current = active.current;
        if (!current || !current.conflict || busy.current) return;
        busy.current = true;
        setSaving(true);
        try {
            await current.session.flush();
            const latestNote =
                current.row.note_id === null
                    ? null
                    : await getLocalNoteByClientId(
                          database,
                          owner,
                          current.row.note_id,
                      );
            if (!latestNote) throw new Error("原笔记已不存在，草稿仍已保留");
            await rebaseNoteDraft(
                database,
                owner,
                {
                    key,
                    sessionId: current.row.session_id,
                    sequence: current.session.sequence,
                },
                latestNote,
            );
            const next = {
                ...current,
                conflict: false,
                current: noteDraftValue(latestNote),
            };
            active.current = next;
            setResource(next);
            setError("");
        } catch (cause) {
            setError(
                cause instanceof Error ? cause.message : "确认本地草稿失败",
            );
            throw cause;
        } finally {
            busy.current = false;
            setSaving(false);
        }
    };

    usePreventRemove(resource !== null, ({ data }) => {
        if (complete.current) {
            navigation.dispatch(data.action);
            return;
        }
        if (!active.current || busy.current) return;
        void beginSave()
            .then(async (snapshot) => {
                const result = await options.beforeLeave?.(snapshot);
                complete.current = true;
                active.current?.session.abandon();
                active.current = null;
                busy.current = false;
                setSaving(false);
                navigation.dispatch(data.action);
                if (result?.afterLeave) setTimeout(result.afterLeave, 0);
            })
            .catch((cause: unknown) => {
                active.current?.session.endSave();
                busy.current = false;
                setSaving(false);
                setError(
                    cause instanceof Error
                        ? cause.message
                        : "离开前保存失败，请重试",
                );
            });
    });

    return {
        resource,
        state,
        error,
        saving,
        beginSave,
        endSave,
        confirmConflict,
        change: (value: NoteDraftValue) =>
            active.current?.session.change(value),
        requestFlush,
        retry: () => {
            if (active.current) requestFlush();
            else {
                setError("");
                setReload((value) => value + 1);
            }
        },
    };
}

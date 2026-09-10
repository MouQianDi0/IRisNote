import { useApplicationDatabase } from "@/core/database";
import { PlainTextEditor } from "@/core/editor";
import { banner, captureNotificationSession } from "@/core/notifications";
import { colors } from "@/shared/theme";
import { LocalOnlyText } from "@/shared/ui/local-only-text";
import { Button, Host } from "@expo/ui";
import { useNavigation, usePreventRemove } from "expo-router/react-navigation";
import { Archive, Trash2 } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform, Pressable, Text, View } from "react-native";
import {
    hasDraftContent,
    listNewNoteDrafts,
} from "../../data/new-note-draft.repository";
import type { NoteDraftValue } from "../../data/note-draft.repository";
import type { Note } from "../../notes.types";
import { NewNoteDraftSession } from "../../services/new-note-draft-session";
import type { DraftWriteState } from "../../services/note-draft-session";
import {
    saveEditedNoteLocalFirst,
    saveNewNoteLocalFirst,
} from "../../services/note-save.service";
import {
    DialogButton,
    DraftDialog,
    DraftLocalNotice,
} from "./draft-dialog";
import { DraftManagerDialog } from "../draft-manager-dialog";

type Props = {
  owner: number;
  categoryId?: number | null;
  categoryName?: string;
  draftKey?: string;
  autoFocusContent?: boolean;
  onCancel: () => void;
  onSaved: (note: Note) => void;
};

export default function NewNoteEditor({
  owner,
  categoryId = null,
  categoryName,
  draftKey,
  autoFocusContent,
  onCancel,
  onSaved,
}: Props) {
  const db = useApplicationDatabase();
  const navigation = useNavigation();
  const [seed] = useState<NoteDraftValue>({
    title: "",
    content: "",
    categoryId,
  });
  const [initial, setInitial] = useState(seed);
  const [editorKey, setEditorKey] = useState("blank");
  const [state, setState] = useState<DraftWriteState>("idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState<
    "recovery" | "leave" | "notice" | null
  >(null);
  // 打开弹窗那一刻快照"是否已有输入"：弹窗期间编辑器被禁用，该值不会变化。
  const [hasInput, setHasInput] = useState(false);
  const [notice, setNotice] = useState("");
  const [noticeTitle, setNoticeTitle] = useState("云端同步未完成");
  const [saved, setSaved] = useState<Note | null>(null);
  const active = useRef<NewNoteDraftSession | null>(null);
  const value = useRef(seed);
  const mounted = useRef(true);
  const locked = useRef(false);
  const completed = useRef(false);
  const allowLeave = useRef(false);
  const pendingLeave = useRef<(() => void) | null>(null);

  const notify = useCallback((next: DraftWriteState, cause?: unknown) => {
    if (!mounted.current) return;
    setState(next);
    setError(cause ? "恢复副本写入失败，请保留当前内容并重试" : "");
  }, []);
  const report = useCallback((cause: unknown, fallback: string) => {
    if (mounted.current)
      setError(cause instanceof Error ? cause.message : fallback);
  }, []);
  const flush = useCallback(() => {
    void active.current
      ?.flush()
      .catch((cause) => report(cause, "恢复副本写入失败"));
  }, [report]);

  /** 把目标草稿装进当前编辑器：接管会话并只丢弃进入时的空白会话。 */
  const adoptDraft = useCallback(
    async (key: string) => {
      const next = await NewNoteDraftSession.resume(db, owner, key, notify);
      if (!mounted.current) {
        await next.close();
        return;
      }
      const previous = active.current;
      active.current = next;
      value.current = next.value;
      setInitial(next.value);
      setEditorKey(next.sessionId);
      setState("saved");
      setDialog(null);
      await previous?.discard().catch(() => undefined);
      await previous?.close().catch(() => undefined);
    },
    [db, owner, notify],
  );

  /** 草稿入口只负责打开弹窗；列表读取、过滤与选择全部由 DraftManagerDialog 处理。 */
  const openDrafts = useCallback(() => {
    setError("");
    setHasInput(hasDraftContent(value.current));
    setDialog("recovery");
  }, []);

  const loadDrafts = useCallback(async () => {
    const found = await listNewNoteDrafts(db, owner);
    const session = active.current;
    // 当前会话正在编辑的那份（自动恢复副本）不算候选。
    return found.filter(
      (entry) =>
        !(
          entry.key === session?.key &&
          entry.row.session_id === session?.sessionId
        ),
    );
  }, [db, owner]);

  // 从草稿箱带 draftKey 进入时直接静默恢复，失败才降级为手动选择弹窗。
  const autoResume = useCallback(async () => {
    if (!draftKey || locked.current || hasDraftContent(value.current)) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await adoptDraft(draftKey);
    } catch {
      if (mounted.current) {
        setError("");
        openDrafts();
      }
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  }, [draftKey, adoptDraft, openDrafts]);

  useEffect(() => {
    mounted.current = true;
    const current = new NewNoteDraftSession(db, owner, seed, notify);
    active.current = current;
    void current.ready
      .then(autoResume)
      .catch((cause) => report(cause, "初始化恢复副本失败"));
    return () => {
      mounted.current = false;
      const closing = active.current;
      active.current = null;
      void closing
        ?.close()
        .catch(() => console.warn("[New draft] 页面卸载补写失败", { owner }));
    };
  }, [db, owner, seed, notify, report, autoResume]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") flush();
    });
    if (Platform.OS !== "web") return () => subscription.remove();
    const visibility = () => {
      if (document.visibilityState === "hidden") flush();
    };
    const unload = (event: BeforeUnloadEvent) => {
      if (!completed.current && hasDraftContent(value.current)) {
        flush();
        event.preventDefault();
        event.returnValue = "";
      }
    };
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pagehide", flush);
    window.addEventListener("beforeunload", unload);
    return () => {
      subscription.remove();
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pagehide", flush);
      window.removeEventListener("beforeunload", unload);
    };
  }, [flush]);

  usePreventRemove(true, ({ data }) => {
    if (allowLeave.current || completed.current) {
      navigation.dispatch(data.action);
      return;
    }
    if (locked.current || pendingLeave.current) return;
    const leave = () => {
      allowLeave.current = true;
      navigation.dispatch(data.action);
    };
    if (!hasDraftContent(value.current)) {
      locked.current = true;
      // 空白会话没有用户内容，即使初始化失败也不阻塞返回。
      void (active.current?.discard() ?? Promise.resolve())
        .catch(() => undefined)
        .then(leave);
      return;
    }
    pendingLeave.current = leave;
    setError("");
    setDialog("leave");
  });

  const keepEditing = () => {
    if (locked.current) return;
    pendingLeave.current = null;
    setDialog(null);
    setError("");
  };

  const leaveWith = async (save: boolean) => {
    const current = active.current;
    if (!current || locked.current) return;
    locked.current = true;
    setBusy(true);
    setError("");
    const sessionCurrent = captureNotificationSession();
    try {
      if (save) await current.saveDraft();
      else await current.discard();
      completed.current = true;
      if (save && sessionCurrent())
        banner.show({
          type: "success",
          title: "草稿已保存",
          message: "仅本机保存，可从笔记列表的草稿入口找回。",
        });
      if (!mounted.current) return;
      setDialog(null);
      const leave = pendingLeave.current;
      pendingLeave.current = null;
      leave?.();
    } catch (cause) {
      report(cause, "处理失败，当前内容已保留");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const resume = async (key: string) => {
    if (locked.current || hasDraftContent(value.current)) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await adoptDraft(key);
    } catch (cause) {
      report(cause, "恢复失败，原草稿已保留");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const submit = async () => {
    const current = active.current;
    if (!current || locked.current || completed.current) return;
    if (!value.current.title.trim() || !value.current.content.trim()) {
      setError("请输入笔记标题和内容");
      return;
    }
    locked.current = true;
    setBusy(true);
    setError("");
    const sessionCurrent = captureNotificationSession();
    const id = "new-note-save:" + current.sessionId;
    let committed = false;
    try {
      const snapshot = await current.beginSave();
      if (!mounted.current || !sessionCurrent()) {
        current.unlock();
        return;
      }
      const payload = {
        title: snapshot.value.title.trim(),
        content: snapshot.value.content.trim(),
        category_id: snapshot.value.categoryId,
      };
      const onLocal = () => {
        committed = true;
        if (sessionCurrent())
          banner.show({
            id,
            type: "success",
            title: "笔记已保存",
            message: "仅本机保存，正在尝试同步到云端。",
          });
      };
      const result = snapshot.target
        ? await saveEditedNoteLocalFirst(
            db,
            owner,
            snapshot.target,
            payload,
            snapshot.commit,
            onLocal,
          )
        : await saveNewNoteLocalFirst(
            db,
            owner,
            { ...payload, category_id: payload.category_id ?? undefined },
            snapshot.commit,
            onLocal,
          );
      current.finish();
      completed.current = true;
      const localNotice = result.draftCleanupPending
        ? "笔记已同步到云端。仅本机草稿清理未完成，内容仍保留，可从草稿入口再次打开并保存以重试清理。"
        : result.cloudState === "unknown"
          ? "笔记已保存，仅本机确认保存成功，云端接收结果未知。草稿和恢复副本已保留。"
          : "笔记已保存，仅本机保存成功，云端同步未完成。草稿和恢复副本已保留。";
      if (sessionCurrent()) {
        const content =
          result.cloudState === "accepted" && !result.draftCleanupPending
            ? {
                type: "success" as const,
                title: "笔记已同步到云端",
                message: "",
              }
            : {
                type: "important" as const,
                title: result.draftCleanupPending
                  ? "笔记已同步，草稿清理未完成"
                  : "云端同步未完成",
                message: localNotice,
              };
        if (
          !banner.resolve(id, {
            ...content,
            lifetime:
              content.type === "important"
                ? { mode: "persistent" }
                : { mode: "timed" },
          })
        )
          banner.show({ id, ...content });
      }
      if (!mounted.current) return;
      if (result.cloudState === "accepted" && !result.draftCleanupPending) {
        onSaved(result.note);
        return;
      }
      setSaved(result.note);
      setNotice(localNotice);
      setNoticeTitle(
        result.draftCleanupPending
          ? "笔记已同步，草稿清理未完成"
          : "云端同步未完成",
      );
      setDialog("notice");
    } catch (cause) {
      current.unlock();
      report(cause, "保存失败，当前内容已保留");
      if (sessionCurrent())
        banner.show({
          id,
          type: "important",
          title: "保存未完成",
          message: committed
            ? "仅本机已保存，后续处理失败，请保留当前内容。"
            : "请保留当前编辑内容并重试。",
        });
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };

  const retry = async () => {
    const current = active.current;
    if (!current || locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      try {
        await current.ready;
      } catch {
        await current.close().catch(() => undefined);
        const next = new NewNoteDraftSession(db, owner, seed, notify);
        active.current = next;
        next.change(value.current);
      }
      await active.current!.flush();
      setError("");
    } catch (cause) {
      report(cause, "重试失败，内容已保留");
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const labels = {
    idle: "输入过程中自动保留恢复副本",
    pending: "恢复副本待写入",
    writing: "正在写入恢复副本…",
    saved: "恢复副本已保存（仅本机）",
    error: "恢复副本写入失败",
  };
  const draftsEntry = (
    <Pressable
      onPress={openDrafts}
      disabled={busy || saved !== null || dialog !== null}
      accessibilityRole="button"
      accessibilityLabel="草稿"
      className="p-2"
    >
      <Archive size={24} color={colors.textPrimary} />
    </Pressable>
  );
  return (
    <View style={{ flex: 1 }}>
      <PlainTextEditor
        key={editorKey}
        initialValue={initial}
        screenTitle="新建笔记"
        autoFocusContent={autoFocusContent}
        saving={busy}
        disabled={saved !== null || dialog !== null}
        onCancel={onCancel}
        onSubmit={submit}
        onBlur={flush}
        headerActions={draftsEntry}
        onChange={(next) => {
          const changed = { ...next, categoryId: value.current.categoryId };
          value.current = changed;
          active.current?.change(changed);
        }}
        statusContent={
          <View style={{ paddingHorizontal: 20, paddingVertical: 8 }}>
            {initial.categoryId !== null && (
              <Text>
                分类：
                {initial.categoryId === categoryId
                  ? categoryName
                  : "#" + initial.categoryId}
              </Text>
            )}
            <Text accessibilityLiveRegion="polite">
              <LocalOnlyText>{labels[state]}</LocalOnlyText>
            </Text>
            {!!error && (
              <>
                <Text accessibilityRole="alert">{error}</Text>
                <Host matchContents>
                  <Button
                    label="重试"
                    onPress={() => void retry()}
                    disabled={busy}
                  />
                </Host>
              </>
            )}
          </View>
        }
      />
      <DraftManagerDialog
        db={db}
        owner={owner}
        visible={dialog === "recovery"}
        onClose={() => {
          if (!busy) setDialog(null);
        }}
        title={() => "草稿箱"}
        load={loadDrafts}
        primaryLabel="继续编辑"
        onPrimary={(key) => void resume(key)}
        primaryDisabled={hasInput}
        primaryHint={
          hasInput
            ? "当前已有输入，请先保存或清空当前内容，再恢复其他草稿。"
            : null
        }
        secondaryLabel="新建笔记"
        onSecondary={() => {
          setDialog(null);
          setError("");
        }}
        externalError={error}
      />
      <DraftDialog
        visible={dialog === "leave"}
        title="是否将内容保存为草稿？"
        onClose={keepEditing}
      >
        <DraftLocalNotice className="mb-3" />
        <View className="mb-3 flex-row items-center gap-1.5">
          <Trash2 size={14} color={colors.hyperTextSecondary} />
          <Text
            numberOfLines={1}
            className="flex-1 text-[13px] leading-[18px] text-hyper-text-secondary"
          >
            不保存将<Text className="font-bold">丢弃本次修改</Text>
            ；改动前的草稿仍会保留。
          </Text>
        </View>
        {!!error && (
          <Text
            accessibilityRole="alert"
            className="mb-3 text-sm text-hyper-error"
          >
            {error}
          </Text>
        )}
        <View className="gap-2.5">
          <View className="flex-row gap-2.5">
            <DialogButton
              variant="secondary"
              className="flex-1"
              label="不保存"
              disabled={busy}
              onPress={() => void leaveWith(false)}
            />
            <DialogButton
              className="flex-1"
              label="保存草稿"
              disabled={busy}
              onPress={() => void leaveWith(true)}
            />
          </View>
          <DialogButton
            variant="tonal"
            label="继续编辑"
            disabled={busy}
            onPress={keepEditing}
          />
        </View>
      </DraftDialog>
      <DraftDialog
        visible={dialog === "notice"}
        title={noticeTitle}
        onClose={() => {
          if (saved) onSaved(saved);
        }}
      >
        <Text className="mb-4 text-sm leading-5 text-black">
          <LocalOnlyText>{notice}</LocalOnlyText>
        </Text>
        <DialogButton
          label="完成并返回"
          onPress={() => {
            if (saved) onSaved(saved);
          }}
        />
      </DraftDialog>
    </View>
  );
}

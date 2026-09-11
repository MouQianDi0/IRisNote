import { colors } from "@/shared/theme";
import {
  CircleAlert,
  Clock,
  CloudAlert,
  CloudCheck,
  CloudOff,
  CloudUpload,
  FileChartPie,
  SquarePen,
} from "lucide-react-native";
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { readReadingProgress } from "../../data/note-reading-progress";
import {
  DEFAULT_NOTE_STATISTICS_OPTIONS,
  getCachedNoteTextStatistics,
} from "../../hooks/noteTextLength";
import type { Note } from "../../notes.types";
import { DialogButton } from "../editor/draft-dialog";
import NoteStatisticsPopover from "./note-statistics-popover";

export function NoteRename({
  note,
  busy,
  onRename,
}: {
  note: Note;
  busy: boolean;
  onRename: (title: string) => Promise<string>;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [message, setMessage] = useState("");
  const submit = async () => {
    if (!title.trim() || busy) return;
    try {
      await onRename(title.trim());
      setMessage("");
      setEditing(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "修改标题失败");
    }
  };
  return (
    <View className="mb-4 gap-2">
      {editing ? (
        <View className="gap-2">
          <TextInput
            accessibilityLabel="笔记标题"
            autoFocus
            value={title}
            onChangeText={setTitle}
            editable={!busy}
            onSubmitEditing={() => void submit()}
            returnKeyType="done"
            className="h-12 rounded-hyper-card bg-hyper-card px-4 text-[17px] text-black"
          />
          <View className="flex-row gap-2.5">
            <DialogButton
              label="放弃修改"
              variant="secondary"
              className="flex-1"
              disabled={busy}
              onPress={() => setEditing(false)}
            />
            <DialogButton
              label="保存标题"
              className="flex-1"
              disabled={busy || !title.trim()}
              onPress={() => void submit()}
            />
          </View>
        </View>
      ) : (
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={2} className="flex-1 text-[17px] text-black">
            {note.title || "未命名笔记"}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="修改标题"
            disabled={busy}
            onPress={() => {
              setTitle(note.title);
              setMessage("");
              setEditing(true);
            }}
            className="h-11 w-11 items-center justify-center"
          >
            <SquarePen
              size={20}
              color={busy ? colors.hyperLabelDisabled : colors.textPrimary}
            />
          </Pressable>
        </View>
      )}
      {!!message && (
        <Text
          accessibilityLiveRegion="polite"
          className="text-sm text-hyper-text-secondary"
        >
          {message}
        </Text>
      )}
    </View>
  );
}

export function NoteOperationInfo({
  note,
  busy,
  onSync,
}: {
  note: Note;
  busy: boolean;
  onSync: () => Promise<string>;
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    let active = true;
    if (note.user_id != null)
      void readReadingProgress(note.user_id, note.id).then((value) => {
        if (active) setProgress(value);
      });
    return () => {
      active = false;
    };
  }, [note.id, note.user_id]);
  const statistics = useMemo(
    () =>
      getCachedNoteTextStatistics(
        note.id,
        note.content,
        DEFAULT_NOTE_STATISTICS_OPTIONS,
      ),
    [note.id, note.content],
  );
  const size = useMemo(() => {
    const mb =
      new TextEncoder().encode(note.title + (note.content ?? "")).byteLength /
      (1024 * 1024);
    return mb > 1024
      ? `${(mb / 1024).toFixed(2)}GB`
      : mb > 0 && mb < 0.01
        ? "<0.01MB"
        : `${mb.toFixed(2)}MB`;
  }, [note.title, note.content]);
  const closed = note.user_id == null;
  const syncing = uploading || note.sync_status === "syncing";
  const failed = message !== "";
  const label = failed
    ? message
    : closed
      ? "云同步已关闭"
      : syncing
        ? "同步中…"
        : note.sync_status === "synced"
          ? "已同步"
          : note.sync_status === "pending"
            ? "等待中"
            : "未同步";
  const Icon = failed
    ? CloudAlert
    : closed
      ? CloudOff
      : syncing || note.sync_status === "pending"
        ? CloudUpload
        : note.sync_status === "synced"
          ? CloudCheck
          : CloudAlert;
  const upload = async () => {
    if (busy || syncing || closed) return;
    setUploading(true);
    setMessage("");
    try {
      await onSync();
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };
  const duration =
    statistics.totalCharacters === 0
      ? "暂无正文"
      : statistics.readingTimeMinutes < 1
        ? "预计不到 1 分钟阅读完"
        : `预计 ${Math.ceil(statistics.readingTimeMinutes)} 分钟阅读完`;
  return (
    <View className="mb-3">
      <View className="gap-3">
        <View className="flex-row items-center">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`云同步：${label}`}
            accessibilityState={{ disabled: busy || syncing || closed }}
            disabled={busy || syncing || closed}
            onPress={() => void upload()}
            hitSlop={{ top: 12, bottom: 12 }}
            className="flex-row items-center gap-1"
          >
            <Icon
              size={20}
              color={failed ? colors.hyperError : colors.hyperTextSecondary}
            />
            <Text
              className={`flex-shrink text-sm ${failed ? "text-hyper-error" : "text-hyper-text-secondary"}`}
            >
              {label}
            </Text>
          </Pressable>
          <View className="h-5 w-5 items-center justify-center">
            <View className="h-5 w-px bg-hyper-divider" />
          </View>
          <View
            accessibilityLabel="标题与正文大小，不含外部附件"
            className="flex-row items-center gap-2"
          >
            <FileChartPie size={20} color={colors.hyperTextSecondary} />
            <Text className="text-sm text-hyper-text-secondary">{size}</Text>
          </View>
        </View>
        <NoteStatisticsPopover
          noteId={note.id}
          content={note.content}
          trigger={
            <View className="flex-row items-center gap-2">
              <Clock size={20} color={colors.hyperTextSecondary} />
              <Text className="text-sm text-hyper-text-secondary">
                {duration}，
                {progress === null ? "尚未阅读" : `上次阅读到 ${progress}%`}
              </Text>
              <CircleAlert
                size={14}
                color="#D3D3D3"
                accessibilityLabel="阅读时间为估算值，进度按滚动位置估算"
              />
            </View>
          }
        />
      </View>
    </View>
  );
}

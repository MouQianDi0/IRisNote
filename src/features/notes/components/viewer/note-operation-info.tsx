import { colors, radius, spacing } from "@/shared/theme";
import {
  CircleAlert,
  Clock,
  CloudAlert,
  CloudCheck,
  CloudOff,
  CloudUpload,
  FileChartPie,
  Save,
  SquarePen,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { readReadingProgress } from "../../data/note-reading-progress";
import {
  DEFAULT_NOTE_STATISTICS_OPTIONS,
  getCachedNoteTextStatistics,
} from "../../hooks/noteTextLength";
import type { Note } from "../../notes.types";
import NoteStatisticsPopover from "./note-statistics-popover";

type NoteRenameProps = {
  note: Note;
  busy: boolean;
  onRename: (title: string) => Promise<string>;
  onRegisterSave: (save: (() => Promise<boolean>) | null) => void;
};

export function NoteRename({
  note,
  busy,
  onRename,
  onRegisterSave,
}: NoteRenameProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(note.title);
  const [message, setMessage] = useState("");
  const [focused, setFocused] = useState(false);
  const titleRef = useRef(note.title);
  const editingRef = useRef(false);
  const savingRef = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  const save = useCallback(async () => {
    if (!editingRef.current) return true;
    if (savingRef.current) return savingRef.current;

    const nextTitle = titleRef.current.trim();
    if (!nextTitle) {
      setMessage("请输入笔记标题");
      return false;
    }

    const operation = (async () => {
      try {
        await onRename(nextTitle);
        setMessage("");
        editingRef.current = false;
        setEditing(false);
        setFocused(false);
        return true;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "修改标题失败");
        return false;
      }
    })();
    savingRef.current = operation;

    try {
      return await operation;
    } finally {
      if (savingRef.current === operation) savingRef.current = null;
    }
  }, [onRename]);

  useEffect(() => {
    onRegisterSave(save);
    return () => onRegisterSave(null);
  }, [onRegisterSave, save]);

  return (
    <View className="mb-4 gap-2">
      {editing ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
          <View style={{ flex: 1, padding: spacing.xxs }}>
            <TextInput
              accessibilityLabel="笔记标题"
              autoFocus
              value={title}
              onChangeText={(nextTitle) => {
                titleRef.current = nextTitle;
                setTitle(nextTitle);
                if (nextTitle.trim()) setMessage("");
              }}
              editable={!busy}
              onFocus={() => setFocused(true)}
              onBlur={() => {
                setFocused(false);
                void save();
              }}
              onSubmitEditing={() => void save()}
              returnKeyType="done"
              selectionColor={colors.primary}
              style={{
                height: 48,
                borderRadius: radius.hyperCard,
                borderCurve: "continuous",
                backgroundColor: colors.hyperCard,
                paddingHorizontal: spacing.xl,
                color: colors.textPrimary,
                fontSize: 17,
              }}
            />
            {focused && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  bottom: 0,
                  left: 0,
                  borderWidth: 2,
                  borderColor: colors.primary,
                  borderRadius: radius.hyperCard + spacing.xxs,
                  borderCurve: "continuous",
                }}
              />
            )}
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="保存"
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={() => void save()}
            style={({ pressed }) => ({
              width: 48,
              // 覆盖输入框完整视觉高度：2dp 选中安全区 + 48dp 灰色本体 + 2dp 选中安全区。
              height: 48 + spacing.xxs * 2,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: radius.hyperCard + spacing.xxs,
              borderCurve: "continuous",
              backgroundColor: busy ? colors.hyperSecondaryDisabled : colors.hyperCard,
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Save
              size={20}
              color={busy ? colors.hyperLabelDisabled : colors.primary}
            />
          </Pressable>
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
              titleRef.current = note.title;
              setTitle(note.title);
              setMessage("");
              editingRef.current = true;
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
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="text-sm text-hyper-error"
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

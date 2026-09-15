import { AppModal as Modal } from "@/shared/ui/Overlay/app-modal";
import {
  ChevronLeft,
  Copy,
  FileCode2,
  FileDown,
  FileText,
  Image as ImageIcon,
  Pin,
  Settings,
  Share2,
  SquarePen,
  Star,
  Trash2,
} from "lucide-react-native";
import { useCallback, useRef, useState, type ComponentType } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  ToastAndroid,
  View,
} from "react-native";
import type { Note } from "../../notes.types";
import { copyNoteToClipboard } from "../NoteShare/CopyNoteToClipboard";
import {
  NoteShareFileGenerationError,
  NoteSharePresentationError,
  NoteShareUnavailableError,
  shareNote,
  shareNoteImage,
  type NoteShareFormat,
} from "../NoteShare/NoteShareManager";
import {
  captureNoteShareImage,
  isNoteShareImageContentTooLong,
  NOTE_SHARE_IMAGE_MAX_CONTENT_LENGTH,
  NoteShareImageCard,
  noteShareImageHostStyle,
} from "../NoteShare/NoteShareToImage";
import {
  NoteOperationInfo,
  NoteRename,
} from "./note-operation-info";

import { colors } from "@/shared/theme";
import { StatusToggle } from "@/shared/ui";
import { DialogButton } from "../editor/draft-dialog";
import { dialogCard, dialogScrim } from "../editor/draft-dialog.styles";

type MenuIcon = ComponentType<{
  size?: number;
  color?: string;
}>;

type NoteContextMenuProps = {
  visible: boolean;
  note: Note | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isPinned: boolean;
  isStarred: boolean;
  statusBusy: boolean;
  onTogglePin: () => void;
  onToggleStar: () => void;
  onRename: (title: string) => Promise<string>;
  onSync: () => Promise<string>;
};

type MenuActionProps = {
  label: string;
  icon: MenuIcon;
  onPress: () => void;
  disabled?: boolean;
  className?: string;
};

function MenuAction({
  label,
  icon: Icon,
  onPress,
  disabled = false,
  className,
}: MenuActionProps) {
  return (
    <DialogButton
      label={label}
      variant="secondary"
      onPress={onPress}
      disabled={disabled}
      className={className}
      leading={
        <Icon
          size={20}
          color={disabled ? colors.hyperLabelDisabled : colors.textPrimary}
        />
      }
    />
  );
}

function ImageShareAction({
  disabled,
  onShare,
  onSettings,
}: {
  disabled: boolean;
  onShare: () => void;
  onSettings: () => void;
}) {
  return (
    <View className="flex-row gap-2.5">
      <MenuAction
        label="分享为图片"
        icon={ImageIcon}
        onPress={onShare}
        disabled={disabled}
        className="flex-1"
      />
      <Pressable
        onPress={onSettings}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="图片分享设置"
        accessibilityState={{ disabled }}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
        className={`h-12 w-12 items-center justify-center rounded-hyper-control ${disabled ? "bg-hyper-secondary-disabled" : "bg-hyper-card"}`}
      >
        <Settings
          size={20}
          color={disabled ? colors.hyperLabelDisabled : colors.textPrimary}
        />
      </Pressable>
    </View>
  );
}

export default function NoteContextMenu({
  visible,
  note,
  onClose,
  onEdit,
  onDelete,
  isPinned,
  isStarred,
  statusBusy,
  onTogglePin,
  onToggleStar,
  onRename,
  onSync,
}: NoteContextMenuProps) {
  const [showShareFormats, setShowShareFormats] = useState(false);
  const [showImageSettings, setShowImageSettings] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const imageCardRef = useRef<View>(null);
  const [renameSave, setRenameSave] = useState<(() => Promise<boolean>) | null>(null);

  const [wasVisible, setWasVisible] = useState(visible);
  if (wasVisible !== visible) {
    setWasVisible(visible);
    if (!visible) {
      setShowShareFormats(false);
      setShowImageSettings(false);
    }
  }

  const registerRenameSave = useCallback(
    (save: (() => Promise<boolean>) | null) => {
      setRenameSave(() => save);
    },
    [],
  );

  const saveRename = async () => renameSave?.() ?? true;

  const closeMenu = async () => {
    if (!(await saveRename())) return false;
    onClose();
    return true;
  };

  const runAction = (action: () => void) => {
    void (async () => {
      if (await closeMenu()) action();
    })();
  };

  const handleCopy = async () => {
    if (!note) return;
    if (!(await closeMenu())) return;
    try {
      await copyNoteToClipboard(note);
      if (Platform.OS === "android") {
        ToastAndroid.show("笔记已复制", ToastAndroid.SHORT);
      } else {
        Alert.alert("提示", "笔记已复制");
      }
    } catch {
      Alert.alert("提示", "复制笔记失败");
    }
  };

  const handleShare = async (format: NoteShareFormat) => {
    if (!note || isSharing) return;
    if (!(await closeMenu())) return;
    setIsSharing(true);
    try {
      await shareNote(note, format);
    } catch (error) {
      console.error("分享笔记文件失败:", error);
      Alert.alert(
        "提示",
        error instanceof NoteShareUnavailableError ||
          error instanceof NoteShareFileGenerationError ||
          error instanceof NoteSharePresentationError
          ? error.message
          : "分享笔记文件失败",
      );
    } finally {
      setIsSharing(false);
    }
  };

  const handleImageShare = async () => {
    if (!note || !imageCardRef.current || isSharing) return;
    if (!(await saveRename())) return;

    if (isNoteShareImageContentTooLong(note.content)) {
      Alert.alert(
        "笔记内容较长",
        `正文超过图片分享上限 ${NOTE_SHARE_IMAGE_MAX_CONTENT_LENGTH} 个字符，是否改为分享 PDF？`,
        [
          { text: "否", style: "cancel" },
          { text: "是", onPress: () => void handleShare("pdf") },
        ],
        { cancelable: false },
      );
      return;
    }

    setIsSharing(true);
    try {
      const fileUri = await captureNoteShareImage(imageCardRef.current);
      onClose();
      await shareNoteImage(fileUri);
    } catch (error) {
      console.error("分享笔记图片失败:", error);
      Alert.alert(
        "提示",
        error instanceof NoteShareUnavailableError ||
          error instanceof NoteSharePresentationError
          ? error.message
          : "生成或分享笔记图片失败",
      );
    } finally {
      setIsSharing(false);
    }
  };

  return (
      <Modal
       visible={visible}
       transparent
       animationType="fade"
       onRequestClose={() => {
         void closeMenu();
       }}
     >
      <View
        className={dialogScrim}
        onStartShouldSetResponder={() => true}
        onResponderRelease={() => {
          void closeMenu();
        }}
      >
        <View
          accessibilityViewIsModal
          className={dialogCard}
          onStartShouldSetResponder={() => true}
        >
              <Text
                accessibilityRole="header"
                className="mb-3 text-2xl leading-8 text-black"
              >
                {showImageSettings
                  ? "图片分享设置"
                  : showShareFormats
                    ? "选择分享格式"
                    : "笔记操作"}
              </Text>
              <ScrollView
                style={{ flexShrink: 1 }}
                keyboardShouldPersistTaps="handled"
              >
                {!showShareFormats && !showImageSettings && note && (
                  <NoteRename
                    key={`rename-${visible}:${note.id}`}
                    note={note}
                    busy={statusBusy}
                    onRename={onRename}
                    onRegisterSave={registerRenameSave}
                  />
                )}
                {!showShareFormats && !showImageSettings && note && (
                  <NoteOperationInfo
                    key={`info-${visible}:${note.id}`}
                    note={note}
                    busy={statusBusy}
                    onSync={onSync}
                  />
                )}
                {!showShareFormats && !showImageSettings && (
                  <View className="mb-3 flex-row gap-2.5">
                    <StatusToggle
                      label="置顶"
                      icon={Pin}
                      selected={isPinned}
                      disabled={statusBusy || !note}
                      onPress={onTogglePin}
                      className="flex-1"
                    />
                    <StatusToggle
                      label="标星"
                      icon={Star}
                      selected={isStarred}
                      disabled={statusBusy || !note}
                      onPress={onToggleStar}
                      className="flex-1"
                    />
                  </View>
                )}
                <View className="gap-2.5">
                  {showImageSettings ? (
                    <>
                      <View className="rounded-hyper-card bg-hyper-card p-4">
                        <Text className="text-[17px] text-black">
                          当前使用默认纸张样式
                        </Text>
                        <Text className="mt-2 text-sm leading-5 text-hyper-text-secondary">
                          主题、比例、字号与水印等自定义选项将在下一步加入。
                        </Text>
                      </View>
                      <MenuAction
                        label="返回分享格式"
                        icon={ChevronLeft}
                        disabled={isSharing}
                        onPress={() => setShowImageSettings(false)}
                      />
                    </>
                  ) : showShareFormats ? (
                    <>
                      <ImageShareAction
                        disabled={isSharing}
                        onShare={() => void handleImageShare()}
                        onSettings={() => setShowImageSettings(true)}
                      />
                      <MenuAction
                        label="分享为 PDF 文件"
                        icon={FileDown}
                        disabled={isSharing}
                        onPress={() => void handleShare("pdf")}
                      />
                      <MenuAction
                        label="分享为 TXT 文件"
                        icon={FileText}
                        disabled={isSharing}
                        onPress={() => void handleShare("txt")}
                      />
                      <MenuAction
                        label="分享为 Markdown 文件"
                        icon={FileCode2}
                        disabled={isSharing}
                        onPress={() => void handleShare("markdown")}
                      />
                      <MenuAction
                        label="返回笔记操作"
                        icon={ChevronLeft}
                        disabled={isSharing}
                        onPress={() => setShowShareFormats(false)}
                      />
                    </>
                  ) : (
                    <View className="flex-row items-center rounded-hyper-card bg-hyper-card">
                      {(
                        [
                          ["编辑", SquarePen, () => runAction(onEdit)],
                          ["复制", Copy, handleCopy],
                          ["分享", Share2, () => setShowShareFormats(true)],
                          ["删除", Trash2, () => runAction(onDelete)],
                        ] as const
                      ).map(([label, Icon, action], index) => (
                        <View
                          key={label}
                          className="flex-1 flex-row items-center"
                        >
                          {index > 0 && (
                            <View className="h-5 w-px bg-hyper-divider" />
                          )}
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={label}
                            disabled={statusBusy || isSharing}
                            accessibilityState={{
                              disabled: statusBusy || isSharing,
                            }}
                            onPress={action}
                            style={({ pressed }) => ({
                              opacity: pressed ? 0.85 : 1,
                            })}
                            className="min-h-12 flex-1 items-center justify-center gap-2 px-2.5 py-3"
                          >
                            <Icon
                              size={20}
                              color={
                                statusBusy
                                  ? colors.hyperLabelDisabled
                                  : colors.textPrimary
                              }
                            />
                            <Text className="text-sm text-black">{label}</Text>
                          </Pressable>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              </ScrollView>
        </View>
        {!!note && (
          <View pointerEvents="none" style={noteShareImageHostStyle}>
            <NoteShareImageCard ref={imageCardRef} note={note} />
          </View>
        )}
      </View>
    </Modal>
  );
}

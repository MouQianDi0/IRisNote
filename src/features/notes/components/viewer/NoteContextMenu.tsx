import {
  ChevronLeft,
  Copy,
  FileCode2,
  FileDown,
  FileText,
  Image as ImageIcon,
  Settings,
  Share2,
  SquarePen,
  Trash2,
} from "lucide-react-native";
import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Alert,
  Modal,
  Platform,
  Pressable,
  Text,
  ToastAndroid,
  TouchableWithoutFeedback,
  View,
} from "react-native";
import {
  copyNoteToClipboard,
  type ShareableNote,
} from "../NoteShare/CopyNoteToClipboard";
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

type MenuIcon = ComponentType<{
  size?: number;
  color?: string;
}>;

type NoteContextMenuProps = {
  visible: boolean;
  note: ShareableNote | null;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
};

type MenuActionProps = {
  label: string;
  icon: MenuIcon;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

function MenuAction({
  label,
  icon: Icon,
  onPress,
  destructive = false,
  disabled = false,
}: MenuActionProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`flex-row items-center gap-3 rounded-[12px] px-4 py-3 ${
        destructive ? "bg-red-50" : "bg-[#F5F5F5]"
      } ${disabled ? "opacity-50" : ""}`}
    >
      <Icon size={21} color={destructive ? "#ef4444" : "#666"} />
      <Text
        className={`text-[15px] font-medium ${
          destructive ? "text-red-500" : "text-gray-700"
        }`}
      >
        {label}
      </Text>
    </Pressable>
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
    <View className={`flex-row gap-2 ${disabled ? "opacity-50" : ""}`}>
      <Pressable
        onPress={onShare}
        disabled={disabled}
        className="flex-1 flex-row items-center gap-3 rounded-[12px] bg-[#F5F5F5] px-4 py-3"
      >
        <ImageIcon size={21} color="#666" />
        <Text className="text-[15px] font-medium text-gray-700">
          分享为图片
        </Text>
      </Pressable>
      <Pressable
        onPress={onSettings}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="图片分享设置"
        className="w-12 items-center justify-center rounded-[12px] bg-[#F5F5F5]"
      >
        <Settings size={21} color="#666" />
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
}: NoteContextMenuProps) {
  const [showShareFormats, setShowShareFormats] = useState(false);
  const [showImageSettings, setShowImageSettings] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const imageCardRef = useRef<View>(null);

  useEffect(() => {
    if (!visible) {
      setShowShareFormats(false);
      setShowImageSettings(false);
    }
  }, [visible]);

  const runAction = (action: () => void) => {
    onClose();
    action();
  };

  const handleCopy = async () => {
    if (!note) return;
    onClose();
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
    setIsSharing(true);
    onClose();
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
      onRequestClose={onClose}
    >
      <TouchableWithoutFeedback onPress={onClose}>
        <View className="flex-1 bg-[rgba(0,0,0,0.4)] justify-center items-center">
          <TouchableWithoutFeedback>
            <View className="bg-white rounded-[16px] p-5 w-[320px] shadow-lg">
              <Text className="text-[18px] font-semibold text-gray-800 text-center mb-2">
                {showImageSettings
                  ? "图片分享设置"
                  : showShareFormats
                    ? "选择分享格式"
                    : "笔记操作"}
              </Text>
              {!!note?.title && (
                <Text
                  className="mb-4 text-center text-[13px] text-gray-400"
                  numberOfLines={1}
                  ellipsizeMode="tail"
                >
                  {note.title}
                </Text>
              )}
              <View className="gap-3">
                {showImageSettings ? (
                  <>
                    <View className="rounded-[12px] bg-[#F5F5F5] px-4 py-4">
                      <Text className="text-[15px] font-medium text-gray-700">
                        当前使用默认纸张样式
                      </Text>
                      <Text className="mt-2 text-[13px] leading-5 text-gray-400">
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
                  <>
                    <MenuAction
                      label="编辑笔记"
                      icon={SquarePen}
                      onPress={() => runAction(onEdit)}
                    />
                    <MenuAction
                      label="复制笔记"
                      icon={Copy}
                      onPress={handleCopy}
                    />
                    <MenuAction
                      label="分享笔记"
                      icon={Share2}
                      onPress={() => setShowShareFormats(true)}
                    />
                    <MenuAction
                      label="删除笔记"
                      icon={Trash2}
                      destructive
                      onPress={() => runAction(onDelete)}
                    />
                  </>
                )}
              </View>
              <Pressable
                onPress={
                  showImageSettings
                    ? () => setShowImageSettings(false)
                    : showShareFormats
                      ? () => setShowShareFormats(false)
                      : onClose
                }
                disabled={isSharing}
                className="mt-4 py-3 rounded-[12px] bg-gray-100"
              >
                <Text className="text-center text-[14px] text-gray-600">
                  {showImageSettings || showShareFormats ? "返回" : "取消"}
                </Text>
              </Pressable>
            </View>
          </TouchableWithoutFeedback>
          {!!note && (
            <View pointerEvents="none" style={noteShareImageHostStyle}>
              <NoteShareImageCard ref={imageCardRef} note={note} />
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

import {
    copyNoteToClipboard,
    type ShareableNote,
} from "@/components/Note/NoteShare/CopyNoteToClipboard";
import { shareNote } from "@/components/Note/NoteShare/NoteShareManager";
import { Copy, Share2, SquarePen, Trash2 } from "lucide-react-native";
import type { ComponentType } from "react";
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
};

function MenuAction({
  label,
  icon: Icon,
  onPress,
  destructive = false,
}: MenuActionProps) {
  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 rounded-[12px] px-4 py-3 ${
        destructive ? "bg-red-50" : "bg-[#F5F5F5]"
      }`}
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

export default function NoteContextMenu({
  visible,
  note,
  onClose,
  onEdit,
  onDelete,
}: NoteContextMenuProps) {
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

  const handleShare = async () => {
    if (!note) return;
    onClose();
    try {
      await shareNote(note);
    } catch {
      Alert.alert("提示", "分享笔记失败");
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
                笔记操作
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
                <MenuAction
                  label="编辑笔记"
                  icon={SquarePen}
                  onPress={() => runAction(onEdit)}
                />
                <MenuAction label="复制笔记" icon={Copy} onPress={handleCopy} />
                <MenuAction
                  label="分享笔记"
                  icon={Share2}
                  onPress={handleShare}
                />
                <MenuAction
                  label="删除笔记"
                  icon={Trash2}
                  destructive
                  onPress={() => runAction(onDelete)}
                />
              </View>
              <Pressable
                onPress={onClose}
                className="mt-4 py-3 rounded-[12px] bg-gray-100"
              >
                <Text className="text-center text-[14px] text-gray-600">
                  取消
                </Text>
              </Pressable>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

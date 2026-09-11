import { ArrowLeft, SquarePen } from "lucide-react-native";
import { Text, TouchableOpacity, View } from "react-native";
import { colors } from "@/shared/theme";

type NoteViewerHeaderProps = {
  onBack: () => void;
  onEdit: () => void;
};

export default function NoteViewerHeader({
  onBack,
  onEdit,
}: NoteViewerHeaderProps) {
  return (
    <View className="flex-row items-center justify-between border-b border-border-soft px-4 py-3">
      <TouchableOpacity onPress={onBack} accessibilityRole="button" accessibilityLabel="返回" className="p-2">
        <ArrowLeft size={24} color={colors.textPrimary} />
      </TouchableOpacity>

      <View pointerEvents="none" style={{ position: "absolute", left: 60, right: 60, top: 0, bottom: 0, justifyContent: "center" }}>
        <Text
          className="text-center text-[18px] font-semibold text-gray-800"
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          查看笔记
        </Text>
      </View>

      <TouchableOpacity
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel="编辑笔记"
        className="p-2"
      >
        <SquarePen size={24} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

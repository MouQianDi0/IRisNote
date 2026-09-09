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
    <View className="flex-row items-center justify-between border-b border-border-soft px-[15px] pb-[15px]">
      <TouchableOpacity onPress={onBack} className="p-[10px]">
        <ArrowLeft size={24} color={colors.textPrimary} />
      </TouchableOpacity>

      <Text
        className="max-w-[70%] text-center text-lg font-bold text-gray-900"
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        查看笔记
      </Text>

      <TouchableOpacity
        onPress={onEdit}
        accessibilityRole="button"
        accessibilityLabel="编辑笔记"
        className="p-[10px]"
      >
        <SquarePen size={24} color={colors.primary} />
      </TouchableOpacity>
    </View>
  );
}

import { colors } from "@/shared/theme";
import { ArrowLeft } from "lucide-react-native";
import { TouchableOpacity, View } from "react-native";

type NoteViewerHeaderProps = {
  onBack: () => void;
};

export default function NoteViewerHeader({ onBack }: NoteViewerHeaderProps) {
  return (
    <View className="h-16 flex-row items-center justify-between border-b border-border-soft px-4">
      <TouchableOpacity
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel="返回"
        className="h-10 w-10 items-center justify-center"
      >
        <ArrowLeft size={24} color={colors.textPrimary} />
      </TouchableOpacity>

      {/* <View pointerEvents="none" style={{ position: "absolute", left: 60, right: 60, top: 0, bottom: 0, justifyContent: "center" }}>
        <Text
          className="text-center text-[18px] font-semibold text-gray-800"
          numberOfLines={1}
          ellipsizeMode="tail"
        >
          笔记
        </Text>
      </View>

      <View pointerEvents="none" className="h-10 w-10" /> */}
    </View>
  );
}

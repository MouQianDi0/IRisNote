import { BackButton } from "@/shared/ui";
import { View } from "react-native";

type NoteViewerHeaderProps = {
  onBack: () => void;
};

export default function NoteViewerHeader({ onBack }: NoteViewerHeaderProps) {
  return (
    <View className="h-16 flex-row items-center justify-between ">
      <BackButton onPress={onBack} accessibilityLabel="返回" />

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

import { ArrowLeft } from "lucide-react-native";
import { Text, TouchableOpacity, View } from "react-native";

type NoteViewerHeaderProps = {
  onBack: () => void;
};

export default function NoteViewerHeader({ onBack }: NoteViewerHeaderProps) {
  return (
    <View className="flex-row items-center justify-between border-b border-[#eee] px-[15px] pb-[15px]">
      <TouchableOpacity onPress={onBack} className="p-[10px]">
        <ArrowLeft size={24} color="#000" />
      </TouchableOpacity>

      <Text
        className="max-w-[70%] text-center text-lg font-bold text-gray-900"
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        查看笔记
      </Text>

      <View className="w-11" />
    </View>
  );
}

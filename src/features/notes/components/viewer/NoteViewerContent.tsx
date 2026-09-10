import { Text, View } from "react-native";

type NoteViewerContentProps = {
  content: string | null;
};

export default function NoteViewerContent({ content }: NoteViewerContentProps) {
  return (
    <View className="mt-6">
      <Text selectable className="text-base leading-7 text-gray-700">
        {content?.trim() || "暂无内容"}
      </Text>
    </View>
  );
}

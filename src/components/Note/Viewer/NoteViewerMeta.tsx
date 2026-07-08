import { ChevronDown } from "lucide-react-native";
import type { ComponentProps } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";

type NoteViewerMetaProps = {
  categoryId: number | null;
  createdAt: string;
  isTitleExpandable: boolean;
  chevronAnimatedStyle: ComponentProps<typeof Animated.View>["style"];
  onToggleTitleExpanded: () => void;
};

const formatCreatedAt = (createdAt: string) => {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return createdAt;
  }

  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
};

export default function NoteViewerMeta({
  categoryId,
  createdAt,
  isTitleExpandable,
  chevronAnimatedStyle,
  onToggleTitleExpanded,
}: NoteViewerMetaProps) {
  return (
    <View className="mt-3 flex-row items-center gap-2">
      <View className="flex-1 flex-row flex-wrap items-center gap-2">
        <View className="rounded-full bg-blue-50 px-3 py-1">
          <Text className="text-xs text-blue-500">
            {categoryId == null ? "默认分类" : `分类 ${categoryId}`}
          </Text>
        </View>
        <Text className="text-xs text-gray-400">
          {formatCreatedAt(createdAt)}
        </Text>
      </View>

      {isTitleExpandable && (
        <Pressable
          onPress={onToggleTitleExpanded}
          className="h-7 w-7 items-center justify-center"
        >
          <Animated.View style={chevronAnimatedStyle}>
            <ChevronDown size={20} color="#6b7280" />
          </Animated.View>
        </Pressable>
      )}
    </View>
  );
}

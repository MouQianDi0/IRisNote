import { Button } from "@/components/ui";
import { colors } from "@/theme";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

export type NoteDetailState = "loading" | "error" | "not-found";

type NoteDetailStateViewProps = {
  loadState: NoteDetailState;
  errorMessage: string;
  onBack: () => void;
  onRetry: () => void | Promise<void>;
};

export default function NoteDetailStateView({
  loadState,
  errorMessage,
  onBack,
  onRetry,
}: NoteDetailStateViewProps) {
  return (
    <View className="flex-1 bg-white px-6 py-5">
      <View className="flex-row items-center justify-between pb-5">
        <Pressable onPress={onBack} className="px-1 py-2">
          <Text className="text-base text-primary">返回</Text>
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center gap-3">
        {loadState === "loading" ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-base text-gray-500">正在加载笔记</Text>
          </>
        ) : (
          <>
            <Text className="text-lg font-semibold text-gray-800">
              {loadState === "not-found" ? "笔记不存在" : "加载失败"}
            </Text>
            <Text className="text-center text-sm text-gray-500">
              {loadState === "not-found"
                ? "当前笔记可能已被删除或链接无效"
                : errorMessage}
            </Text>
            <Button
              onPress={() => {
                void onRetry();
              }}
              className="mt-2 rounded-full px-5 py-2"
            >
              <Text className="font-semibold text-white">重试</Text>
            </Button>
          </>
        )}
      </View>
    </View>
  );
}

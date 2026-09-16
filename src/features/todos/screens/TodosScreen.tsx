import { Text, View } from "react-native";

export default function TodosScreen() {
  return (
    <View className="mt-[15px] flex-1">
      <View className="relative flex-1 border-t border-note-page-border bg-white">
        <View className="flex-1 items-center justify-center px-4">
          <Text className="mb-[10px] text-2xl font-bold">待办事项</Text>
          <Text className="mb-5 text-base text-text-secondary">
            这里是你的待办清单
          </Text>
          <Text className="text-sm text-text-muted">点击 + 按钮添加新待办</Text>
        </View>
      </View>
    </View>
  );
}

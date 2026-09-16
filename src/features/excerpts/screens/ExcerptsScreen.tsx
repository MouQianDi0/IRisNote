import { Text, View } from "react-native";

export default function ExcerptsScreen() {
  return (
    <View className="mt-[15px] flex-1 bg-app-background">
      <View className="relative flex-1 border-t border-note-page-border bg-white">
        <View className="flex-1 items-center justify-center px-4">
          <Text className="mb-[10px] text-2xl font-bold">剪贴板摘录</Text>
          <Text className="mb-5 text-base text-text-secondary">
            这里是你的剪贴板摘录
          </Text>
          <Text className="text-sm text-text-muted">
            点击 + 按钮添加新摘录内容
          </Text>
        </View>
      </View>
    </View>
  );
}

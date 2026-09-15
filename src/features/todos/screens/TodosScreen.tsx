import { Text, View } from "react-native";

export default function TodosScreen() {
    return (
        <View className="mt-[15px] flex-1 bg-app-background">
            <View className="relative mb-2 h-[100%] flex-1 border-[1px] border-note-page-border bg-white shadow-lg">
                <View
                    pointerEvents="none"
                    className="absolute bottom-[25%] left-0 top-[25%] border-l border-dashed border-note-page-border"
                />
                <View className="flex-1 items-center justify-center px-4">
                    <Text className="mb-[10px] text-2xl font-bold">
                        待办事项
                    </Text>
                    <Text className="mb-5 text-base text-text-secondary">
                        这里是你的待办清单
                    </Text>
                    <Text className="text-sm text-text-muted">
                        点击 + 按钮添加新待办
                    </Text>
                </View>
            </View>
        </View>
    );
}

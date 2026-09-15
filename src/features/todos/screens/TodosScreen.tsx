import { Screen } from "@/shared/ui";
import { Text } from "react-native";

export default function TodosScreen() {
    return (
        <Screen variant="centeredMuted">
            <Text className="mb-[10px] text-2xl font-bold">待办事项</Text>
            <Text className="mb-5 text-base text-text-secondary">
                这里是你的待办清单
            </Text>
            <Text className="text-sm text-text-muted">
                点击 + 按钮添加新待办
            </Text>
        </Screen>
    );
}

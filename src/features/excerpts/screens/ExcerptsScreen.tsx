import { Screen } from "@/shared/ui";
import { Text } from "react-native";

export default function ExcerptsScreen() {
    return (
        <Screen variant="centeredMuted">
            <Text className="mb-[10px] text-2xl font-bold">剪贴板摘录</Text>
            <Text className="mb-5 text-base text-text-secondary">
                这里是你的剪贴板摘录
            </Text>
            <Text className="text-sm text-text-muted">
                点击 + 按钮添加新摘录内容
            </Text>
        </Screen>
    );
}

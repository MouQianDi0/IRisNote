import { Screen } from "@/components/ui";
import { Text } from "react-native";

export default function Settings() {
    return (
        <Screen className="items-center justify-center bg-settings-background">
            <Text className="mb-5 text-2xl font-bold text-white">设置</Text>
            <Text className="mt-[10px] text-base text-text-subtle">主题:深色</Text>
            <Text className="mt-[10px] text-base text-text-subtle">字体大小:中</Text>
            <Text className="mt-[10px] text-base text-text-subtle">通知:开启</Text>
            <Text className="mt-[10px] text-base text-text-subtle">关于我们</Text>
        </Screen>
    );
}

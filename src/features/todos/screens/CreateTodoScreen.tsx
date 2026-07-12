import { Screen } from "@/shared/ui";
import { Text } from "react-native";

export default function CreateTodoScreen() {
    return (
        <Screen variant="centeredMuted">
            <Text className="text-2xl font-bold">新建待办</Text>
        </Screen>
    );
}

import { Pin, Star, Trash2, X } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { semanticColors } from "@/shared/theme";
import { TodoIconAction } from "./TodoIconAction";

export function TodoBatchToolbar({
    count,
    onClose,
    onAll,
    onStar,
    onPin,
    onDelete,
}: {
    count: number;
    onClose: () => void;
    onAll: () => void;
    onStar: () => void;
    onPin: () => void;
    onDelete: () => void;
}) {
    return (
        <View
            style={{
                minHeight: 44,
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
            }}
        >
            <TodoIconAction
                icon={X}
                label="退出待办批量模式"
                onPress={onClose}
            />
            <Text
                style={{
                    fontSize: 14,
                    color: semanticColors.textPrimary,
                    flexGrow: 1,
                }}
            >
                已选 {count} 项
            </Text>
            <Pressable
                accessibilityRole="button"
                accessibilityLabel="全选当前待办结果"
                onPress={onAll}
                style={{
                    minHeight: 44,
                    paddingHorizontal: 8,
                    justifyContent: "center",
                }}
            >
                <Text
                    style={{ fontSize: 14, color: semanticColors.brandPrimary }}
                >
                    全选
                </Text>
            </Pressable>
            <TodoIconAction
                icon={Star}
                label="批量标星待办"
                disabled={!count}
                onPress={onStar}
            />
            <TodoIconAction
                icon={Pin}
                label="批量置顶待办"
                disabled={!count}
                onPress={onPin}
            />
            <TodoIconAction
                icon={Trash2}
                label="批量删除待办"
                danger
                disabled={!count}
                onPress={onDelete}
            />
        </View>
    );
}

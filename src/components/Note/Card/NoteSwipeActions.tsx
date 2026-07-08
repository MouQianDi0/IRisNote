import { Pin, Star, Trash2 } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

type NoteSwipeActionsProps = {
    isPinned?: boolean;
    isStarred?: boolean;
    onPinPress: () => void;
    onStarPress: () => void;
    onDeletePress: () => void;
};

export default function NoteSwipeActions({
    isPinned,
    isStarred,
    onPinPress,
    onStarPress,
    onDeletePress,
}: NoteSwipeActionsProps) {
    return (
        <View className="absolute inset-0 flex-row justify-between bg-transparent">
            <View className="flex-row overflow-hidden rounded-[14px] bg-[#e8f1ff]">
                <Pressable
                    onPress={onPinPress}
                    className="h-full w-[69px] items-center justify-center gap-1 bg-[#d9e7ff]"
                >
                    <Pin
                        size={20}
                        color={isPinned ? "#2563eb" : "#4b5563"}
                        fill={isPinned ? "#2563eb" : "transparent"}
                    />
                    <Text className="text-xs font-semibold text-gray-700">
                        {isPinned ? "取消" : "置顶"}
                    </Text>
                </Pressable>
                <Pressable
                    onPress={onStarPress}
                    className="h-full w-[69px] items-center justify-center gap-1 bg-[#fff4cc]"
                >
                    <Star
                        size={20}
                        color={isStarred ? "#f59e0b" : "#4b5563"}
                        fill={isStarred ? "#f59e0b" : "transparent"}
                    />
                    <Text className="text-xs font-semibold text-gray-700">
                        {isStarred ? "取消" : "标星"}
                    </Text>
                </Pressable>
            </View>

            <Pressable
                onPress={onDeletePress}
                className="h-full w-[76px] items-center justify-center gap-1 rounded-[14px] bg-[#ff4d4f]"
            >
                <Trash2 size={22} color="#fff" />
                <Text className="text-xs font-semibold text-white">删除</Text>
            </Pressable>
        </View>
    );
}

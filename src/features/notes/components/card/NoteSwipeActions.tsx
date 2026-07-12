import { Pin, Star, Trash2 } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { colors } from "@/shared/theme";

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
            <View className="flex-row overflow-hidden rounded-card bg-note-actions">
                <Pressable
                    onPress={onPinPress}
                    className="h-full w-[69px] items-center justify-center gap-1 bg-note-pin-action"
                >
                    <Pin
                        size={20}
                        color={isPinned ? colors.pin : colors.noteActionText}
                        fill={isPinned ? colors.pin : colors.transparent}
                    />
                    <Text className="text-xs font-semibold text-gray-700">
                        {isPinned ? "取消" : "置顶"}
                    </Text>
                </Pressable>
                <Pressable
                    onPress={onStarPress}
                    className="h-full w-[69px] items-center justify-center gap-1 bg-note-star-action"
                >
                    <Star
                        size={20}
                        color={isStarred ? colors.star : colors.noteActionText}
                        fill={isStarred ? colors.star : colors.transparent}
                    />
                    <Text className="text-xs font-semibold text-gray-700">
                        {isStarred ? "取消" : "标星"}
                    </Text>
                </Pressable>
            </View>

            <Pressable
                onPress={onDeletePress}
                className="h-full w-[76px] items-center justify-center gap-1 rounded-card bg-note-delete-action"
            >
                <Trash2 size={22} color={colors.surface} />
                <Text className="text-xs font-semibold text-white">删除</Text>
            </Pressable>
        </View>
    );
}

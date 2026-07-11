import PinBadge from "@/components/PinBadge";
import StarBadge from "@/components/StarBadge";
import { colors } from "@/shared/theme";
import { Pressable, Text, View } from "react-native";

type NoteCardProps = {
    title: string;
    content: string | null;
    categoryName: string;
    isPinned?: boolean;
    isStarred?: boolean;
    onPress: () => void;
};

export default function NoteCard({
    title,
    content,
    categoryName,
    isPinned,
    isStarred,
    onPress,
}: NoteCardProps) {
    return (
        <Pressable
            onPress={onPress}
            className="bg-note-card rounded-card p-5 overflow-hidden shadow-lg"
            style={{ width: "100%", maxWidth: 400, maxHeight: 175 }}
        >
            <View className="flex-row items-start justify-between gap-3">
                <Text
                    className="flex-1 text-base font-semibold text-gray-800"
                    numberOfLines={2}
                    ellipsizeMode="tail"
                >
                    {title}
                </Text>
                <View className="flex-row gap-1">
                    {isPinned && <PinBadge size={14} color={colors.pin} />}
                    {isStarred && <StarBadge size={14} color={colors.star} />}
                </View>
            </View>
            <Text
                className="text-sm text-gray-500 mt-1"
                numberOfLines={4}
                ellipsizeMode="tail"
            >
                {content}
            </Text>
            <View className="flex-row items-center mt-2">
                <View className="bg-blue-50 rounded-full px-2 py-0.5">
                    <Text className="text-xs text-blue-500">
                        {categoryName}
                    </Text>
                </View>
            </View>
        </Pressable>
    );
}

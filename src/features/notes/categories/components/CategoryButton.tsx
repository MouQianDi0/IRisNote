import { CategoryIcon } from "../category-icons";
import type { Category } from "@/features/notes/categories/categories.types";
import { pulse } from "@/shared/theme/motion";
import { colors } from "@/shared/theme";
import { Pressable, Text } from "react-native";
import Animated from "react-native-reanimated";
import StarBadge from "../../components/StarBadge";

type FloatingBarCategoryButtonProps = {
    category: Category;
    isActive: boolean;
    onPress: () => void;
    onLongPress?: () => void;
};

export default function FloatingBarCategoryButton({
    category,
    isActive,
    onPress,
    onLongPress,
}: FloatingBarCategoryButtonProps) {
    return (
        <Pressable
            onLongPress={onLongPress}
            delayLongPress={400}
            className={`relative mb-[6px] h-[60px] w-[50px] items-center justify-center rounded-control py-[4px] pr-[4px] pl-[6px]`}
            onPress={onPress}
        >
            {category.is_starred && (
                <StarBadge
                    size={18}
                    style={{
                        position: "absolute",
                        right: 0,
                        top: 0,
                        zIndex: 10,
                    }}
                />
            )}

            {isActive ? (
                <Animated.View
                    style={{
                        animationName: pulse,
                        animationDuration: "0.5s",
                        animationTimingFunction: "ease-out",
                    }}
                >
                    <CategoryIcon
                        name={category.icon}
                        size={30}
                        color={colors.floatingAccentOpaque}
                    />
                </Animated.View>
            ) : (
                <CategoryIcon
                    name={category.icon}
                    size={30}
                    color={colors.textSecondary}
                />
            )}

            <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                className={`max-w-[44px] text-[10px] ${
                    isActive ? "font-semibold text-blue-500" : "text-gray-400"
                }`}
            >
                {category.name}
            </Text>
        </Pressable>
    );
}

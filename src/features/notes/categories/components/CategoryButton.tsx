import { getCategoryIcon } from "../category-icons";
import type { Category } from "@/features/notes/categories/categories.types";
import { pulse } from "@/shared/theme/motion";
import { colors } from "@/shared/theme";
import { Pressable, Text } from "react-native";
import Animated from "react-native-reanimated";
import { tv } from "tailwind-variants";
import StarBadge from "../../components/StarBadge";

const categoryButtonStyles = tv({
    slots: {
        base: "relative mb-[6px] h-[60px] w-[50px] items-center justify-center rounded-control py-[4px] pl-[6px] pr-[4px]",
        label: "max-w-[44px] text-[10px]",
    },
    variants: {
        active: {
            true: {
                label: "font-semibold text-blue-500",
            },
            false: {
                label: "text-gray-400",
            },
        },
    },
    defaultVariants: {
        active: false,
    },
});

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
    const IconComponent = getCategoryIcon(category.icon);
    const { base, label } = categoryButtonStyles({ active: isActive });

    return (
        <Pressable
            onLongPress={onLongPress}
            delayLongPress={400}
            className={base()}
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
                    <IconComponent
                        size={30}
                        color={colors.floatingAccentOpaque}
                    />
                </Animated.View>
            ) : (
                <IconComponent size={30} color={colors.textSecondary} />
            )}

            <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                className={label()}
            >
                {category.name}
            </Text>
        </Pressable>
    );
}

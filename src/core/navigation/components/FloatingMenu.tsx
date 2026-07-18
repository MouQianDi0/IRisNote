import { type Href, usePathname, useRouter } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { tv } from "tailwind-variants";
import {
    getFloatingMenuHidden,
    onFloatingMenuVisibilityChanged,
} from "../floating-menu-visibility";
import { TAB_MENU_ITEMS } from "../navigation.constants";
import { useSwipeTab } from "../hooks/useSwipeTab";
import { pulse } from "@/shared/theme/motion";
import { colors } from "@/shared/theme";
import FloatingActionButton from "./FloatingActionButton";

const hiddenOffsetX = 130;

const floatingMenuItemStyles = tv({
    base: "my-[5] size-[50] items-center justify-center rounded-full",
    variants: {
        active: {
            true: "opacity-100",
            false: "opacity-70",
        },
    },
    defaultVariants: {
        active: false,
    },
});

export default function FloatingMenu({ state }: BottomTabBarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const activeTab = state.routes[state.index]?.name ?? "note";
    const panHandlers = useSwipeTab(pathname);
    const translateX = useSharedValue(
        getFloatingMenuHidden() ? hiddenOffsetX : 0,
    );

    useEffect(() => {
        const unsubscribe = onFloatingMenuVisibilityChanged((hidden) => {
            translateX.value = withTiming(hidden ? hiddenOffsetX : 0, {
                duration: 600,
            });
        });

        return unsubscribe;
    }, [translateX]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateX: translateX.value }],
    }));

    return (
        <Animated.View
            className="absolute bottom-[50] right-4 items-end flex"
            style={animatedStyle}
            {...panHandlers}
        >
            <View className="mb-[15] rounded-floating bg-floating-surface px-2 py-[10] shadow-md">
                {TAB_MENU_ITEMS.map((item, index) => (
                    <Pressable
                        key={index}
                        className={floatingMenuItemStyles({
                            active: activeTab === item.key,
                        })}
                        style={({ pressed }) =>
                            pressed ? { opacity: 0.7 } : undefined
                        }
                        onPress={() => {
                            if (activeTab === item.key) return;
                            router.replace(item.route as Href);
                        }}
                    >
                        {activeTab === item.key ? (
                            <Animated.View
                                style={{
                                    animationName: pulse,
                                    animationDuration: "0.5s",
                                    animationTimingFunction: "ease-out",
                                }}
                            >
                                <item.icon
                                    size={24}
                                    color={colors.floatingAccentOpaque}
                                />
                            </Animated.View>
                        ) : (
                            <item.icon
                                size={24}
                                color={colors.textSecondary}
                            />
                        )}
                        <Text className="top-[3] text-center text-xs text-text-secondary opacity-100">
                            {item.name}
                        </Text>
                    </Pressable>
                ))}
            </View>
            <FloatingActionButton />
        </Animated.View>
    );
}

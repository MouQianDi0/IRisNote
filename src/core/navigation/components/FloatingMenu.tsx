import { colors } from "@/shared/theme";
import { pulse } from "@/shared/theme/motion";
import { type Href, usePathname, useRouter } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import {
    getFloatingMenuHidden,
    onFloatingMenuVisibilityChanged,
} from "../floating-menu-visibility";
import { useSwipeTab } from "../hooks/useSwipeTab";
import { TAB_MENU_ITEMS } from "../navigation.constants";
import FloatingActionButton from "./FloatingActionButton";

const initialHiddenOffsetY = 66 + 50 + 16;

export default function FloatingMenu({ state }: BottomTabBarProps) {
    const router = useRouter();
    const pathname = usePathname();
    const activeTab = state.routes[state.index]?.name ?? "note";
    const panHandlers = useSwipeTab(pathname);
    const hiddenOffsetY = useSharedValue(initialHiddenOffsetY);
    const translateY = useSharedValue(
        getFloatingMenuHidden() ? initialHiddenOffsetY : 0,
    );

    useEffect(() => {
        const unsubscribe = onFloatingMenuVisibilityChanged((hidden) => {
            translateY.value = withTiming(hidden ? hiddenOffsetY.value : 0, {
                duration: 300,
            });
        });

        return unsubscribe;
    }, [hiddenOffsetY, translateY]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.value }],
    }));

    return (
        <Animated.View
            className="absolute bottom-[20] left-[16] right-[16] flex-row items-center gap-[15]"
            style={animatedStyle}
            onLayout={({ nativeEvent }) => {
                // Include the bottom offset and shadow clearance when sliding offscreen.
                hiddenOffsetY.set(nativeEvent.layout.height + 50);
                if (getFloatingMenuHidden()) {
                    translateY.set(hiddenOffsetY.get());
                }
            }}
        >
            <View
                className="h-[66] min-w-0 flex-1 flex-row items-center rounded-floating bg-floating-surface p-[8] shadow-md"
                {...panHandlers}
            >
                {TAB_MENU_ITEMS.map((item, index) => (
                    <Pressable
                        key={index}
                        className={`h-[50] min-w-0 flex-1 items-center justify-center rounded-full ${
                            activeTab === item.key
                                ? "opacity-100"
                                : "opacity-70"
                        }`}
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
                            <item.icon size={24} color={colors.textSecondary} />
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

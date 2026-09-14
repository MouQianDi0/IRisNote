import { colors } from "@/shared/theme";
import { pulse } from "@/shared/theme/motion";
import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { usePathname, useRouter, type Href } from "expo-router";
import type { BottomTabBarProps } from "expo-router/tabs";
import { useEffect, type RefObject } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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

const FADE_HEIGHT = 15;
const MENU_HEIGHT = 66;
const BOTTOM_SPACE = 20;
const BACKDROP_HEIGHT = FADE_HEIGHT + MENU_HEIGHT + BOTTOM_SPACE;
const SHADOW_CLEARANCE = 16;
const initialHiddenOffsetY = BACKDROP_HEIGHT + SHADOW_CLEARANCE;

export default function FloatingMenu({
    state,
    blurTarget,
}: BottomTabBarProps & {
    blurTarget: RefObject<View | null>;
}) {
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
            translateY.set(
                withTiming(hidden ? hiddenOffsetY.get() : 0, {
                    duration: 300,
                }),
            );
        });

        return unsubscribe;
    }, [hiddenOffsetY, translateY]);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ translateY: translateY.get() }],
    }));

    return (
        <Animated.View
            pointerEvents="box-none"
            style={[styles.container, animatedStyle]}
            onLayout={({ nativeEvent }) => {
                // Move the entire backdrop, including its fade, beyond the screen edge.
                hiddenOffsetY.set(nativeEvent.layout.height + SHADOW_CLEARANCE);
                if (getFloatingMenuHidden()) {
                    translateY.set(hiddenOffsetY.get());
                }
            }}
        >
            <MaskedView
                pointerEvents="none"
                style={StyleSheet.absoluteFill}
                maskElement={
                    <LinearGradient
                        colors={["transparent", "black", "black"]}
                        locations={[0, FADE_HEIGHT / BACKDROP_HEIGHT, 1]}
                        style={StyleSheet.absoluteFill}
                    />
                }
            >
                <BlurView
                    key={activeTab}
                    blurTarget={blurTarget}
                    blurMethod="dimezisBlurViewSdk31Plus"
                    intensity={20}
                    tint="default"
                    style={StyleSheet.absoluteFill}
                />

                <View
                    pointerEvents="none"
                    style={[
                        StyleSheet.absoluteFill,
                        { backgroundColor: "rgba(255, 255, 255, 0.2)" },
                    ]}
                />
            </MaskedView>
            <View pointerEvents="box-none" style={styles.controls}>
                <View
                    className="h-[66] min-w-0 flex-1 flex-row items-center rounded-floating bg-white p-[8] shadow-md"
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
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    container: {
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        height: BACKDROP_HEIGHT,
    },
    controls: {
        position: "absolute",
        top: FADE_HEIGHT,
        left: 16,
        right: 16,
        height: MENU_HEIGHT,
        flexDirection: "row",
        alignItems: "center",
        gap: 15,
    },
});

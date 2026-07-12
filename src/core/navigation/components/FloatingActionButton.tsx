import { type Href, usePathname } from "expo-router";
import { Pressable } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { getMainAction } from "../navigation.constants";
import { useDebouncedNavigation } from "../hooks/useDebouncedNavigation";
import { useLongPressNavigation } from "../hooks/useLongPressNavigation";
import { shake } from "@/shared/theme/motion";
import { colors } from "@/shared/theme";

export default function FloatingActionButton() {
    const pathname = usePathname();
    const onNavigate = useDebouncedNavigation();
    const action = getMainAction(pathname);

    const { icon: ActionIcon } = action;
    const { gesture: longPress, animatedStyle } = useLongPressNavigation(
        action.route as Href,
    );

    return (
        <Animated.View style={animatedStyle}>
            <GestureDetector gesture={longPress}>
                <Pressable
                    className="size-[66] items-center justify-center rounded-floating bg-action shadow-md"
                    style={({ pressed }) =>
                        pressed
                            ? { backgroundColor: colors.action, opacity: 0.7 }
                            : undefined
                    }
                    onPress={() =>
                        onNavigate(action.route as Href)
                    }
                >
                    <Animated.View
                        style={{
                            animationName: shake,
                            animationDuration: "2s",
                            animationIterationCount: "infinite",
                            animationTimingFunction: "ease-in-out",
                        }}
                    >
                        <ActionIcon size={35} color={colors.surfaceFull} />
                    </Animated.View>
                </Pressable>
            </GestureDetector>
        </Animated.View>
    );
}

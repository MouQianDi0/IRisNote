import { type Href, usePathname } from "expo-router";
import { Pressable } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { getAction } from "../data/actions";
import { shake } from "../hooks/animations";
import { useDebounceNavigation } from "../hooks/useDebounced/useDebounceNavigation";
import { useLongPressButton } from "../hooks/useLongPressButton";
import { colors } from "../theme";

export default function ActionButton() {
    const pathname = usePathname();
    const onNavigate = useDebounceNavigation();

    const { icon: ActionIcon } = getAction(pathname);
    const { gesture: longPress, animatedStyle } = useLongPressButton(
        getAction(pathname).route as Href,
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
                        onNavigate(getAction(pathname).route as Href)
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

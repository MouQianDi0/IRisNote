import { type Href, usePathname } from "expo-router";
import { ClipboardPenLine, PencilLine, Settings, SquareCheckBig } from "lucide";
import { MorphIcon, type IconInput } from "morphicons/react-native";
import { Pressable } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";
import { getActiveTabKey, getMainAction } from "../navigation.constants";
import type { TabKey } from "../navigation.types";
import { useDebouncedNavigation } from "../hooks/useDebouncedNavigation";
import { useLongPressNavigation } from "../hooks/useLongPressNavigation";
import { colors } from "@/shared/theme";
import { shake } from "@/shared/theme/motion";

const ACTION_ICONS = {
    note: PencilLine,
    todo: SquareCheckBig,
    excerpt: ClipboardPenLine,
    user: Settings,
} satisfies Record<TabKey, IconInput>;

export default function FloatingActionButton() {
    const pathname = usePathname();
    const onNavigate = useDebouncedNavigation();
    const action = getMainAction(pathname);

    const { label } = action;
    const icon = ACTION_ICONS[getActiveTabKey(pathname)];
    const { gesture: longPress, animatedStyle } = useLongPressNavigation(
        action.route as Href,
    );

    return (
        <Animated.View style={animatedStyle}>
            <GestureDetector gesture={longPress}>
                <Pressable
                    accessibilityLabel={label}
                    accessibilityRole="button"
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
                        <MorphIcon
                            icon={icon}
                            size={35}
                            color={colors.surfaceFull}
                            spring="snappy"
                            reducedMotion="user"
                        />
                    </Animated.View>
                </Pressable>
            </GestureDetector>
        </Animated.View>
    );
}

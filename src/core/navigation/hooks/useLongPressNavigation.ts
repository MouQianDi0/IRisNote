import { type Href, usePathname, useRouter } from "expo-router";
import { Gesture } from "react-native-gesture-handler";
import {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { buttonEasing } from "@/shared/theme/motion";

export function useLongPressNavigation(actionRoute: Href) {
    const router = useRouter();
    const pathname = usePathname();
    const scale = useSharedValue(1);
    const didNavigate = useSharedValue(false);
    const didStart = useSharedValue(false);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.get() }],
    }));

    const gesture = Gesture.Pan()
        .activateAfterLongPress(400)
        .onStart(() => {
            "worklet";
            didStart.set(true);
            didNavigate.set(false);
            scale.set(
                withTiming(
                    0.85,
                    {
                        duration: 300,
                        easing: buttonEasing,
                    },
                    (finished) => {
                        if (
                            finished &&
                            !didNavigate.get() &&
                            actionRoute !== pathname
                        ) {
                            didNavigate.set(true);
                            runOnJS(router.push)(actionRoute);
                        }
                    },
                ),
            );
        })
        .onFinalize(() => {
            "worklet";
            if (
                didStart.get() &&
                !didNavigate.get() &&
                actionRoute !== pathname
            ) {
                didNavigate.set(true);
                runOnJS(router.push)(actionRoute);
            }

            scale.set(
                withTiming(1, {
                    duration: 400,
                    easing: buttonEasing,
                }),
            );
        });

    return { gesture, animatedStyle };
}

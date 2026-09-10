import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import Animated, {
    cancelAnimation,
    Easing,
    interpolate,
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { PopoverPosition } from "./use-anchored-popover-layout";

type PopoverMotionPhase = "measuring" | "presented" | "exiting";

type PopoverMotionProps = PropsWithChildren<{
  phase: PopoverMotionPhase;
  position: PopoverPosition;
  accessibilityLabel: string;
  onExited: () => void;
}>;

const ENTER_DURATION = 160;
const EXIT_DURATION = 110;
const TRANSLATE_DISTANCE = 12;

export function PopoverMotion({
  phase,
  position,
  accessibilityLabel,
  onExited,
  children,
}: PopoverMotionProps) {
  const progress = useSharedValue(0);
  const direction = position.placement === "bottom" ? 1 : -1;

  useEffect(() => {
    cancelAnimation(progress);

    if (phase === "measuring") {
      progress.value = 0;
      return;
    }

    if (phase === "presented") {
      progress.value = withTiming(1, {
        duration: ENTER_DURATION,
        easing: Easing.inOut(Easing.quad),
      });
      return;
    }

    progress.value = withTiming(
      0,
      {
        duration: EXIT_DURATION,
        easing: Easing.inOut(Easing.quad),
      },
      (finished) => {
        if (finished) scheduleOnRN(onExited);
      },
    );
  }, [onExited, phase, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      {
        translateY: interpolate(
          progress.value,
          [0, 1],
          [direction * TRANSLATE_DISTANCE, 0],
        ),
      },
    ],
  }));

  const interactive = phase === "presented";

  return (
    <Animated.View
      accessibilityLabel={accessibilityLabel}
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? "auto" : "no-hide-descendants"}
      pointerEvents={interactive ? "auto" : "none"}
      collapsable={false}
      style={[
        {
          position: "absolute",
          left: position.left,
          top: position.top,
          width: position.width,
        },
        animatedStyle,
      ]}
    >
      {children}
    </Animated.View>
  );
}

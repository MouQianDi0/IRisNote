import { ScrollView } from "react-native";
import { useCallback, useMemo } from "react";
import {
  Gesture,
  GestureDetector,
  type GestureStateChangeEvent,
  type GestureUpdateEvent,
  type PanGestureHandlerEventPayload,
} from "react-native-gesture-handler";
import Animated, {
  scrollTo,
  useAnimatedStyle,
  useSharedValue,
  type AnimatedRef,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { MoveVertical } from "lucide-react-native";
import { colors } from "@/shared/theme";
import { clamp } from "../../reading/reading-position";
import { dragReadingOffset } from "../../reading/reading-interaction";

export type ScrollbarProps = {
  scrollRef: AnimatedRef<ScrollView>;
  offset: SharedValue<number>;
  percent: SharedValue<number>;
  finger: SharedValue<{ x: number; y: number }>;
  dragging: SharedValue<boolean>;
  bubble: SharedValue<boolean>;
  activity: SharedValue<number>;
  bubbleActivity: SharedValue<number>;
  viewport: number;
  start: number;
  end: number;
  disabled: boolean;
  onBegin: () => void;
  onEnd: (offset: number) => void;
};
export default function ReadingScrollbar({
  scrollRef,
  offset,
  percent,
  finger,
  dragging,
  bubble,
  activity,
  bubbleActivity,
  viewport,
  start,
  end,
  disabled,
  onBegin,
  onEnd,
}: ScrollbarProps) {
  const initial = useSharedValue(0);
  // Reserve the toolbar's bottom 40 + touch height 48, an 8dp gap, and this 50dp touch area.
  const travel = Math.max(0, viewport - 8 - 96 - 50);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: 8 + (percent.get() / 100) * travel }],
  }));
  const handleStart = useCallback(
    (e: GestureStateChangeEvent<PanGestureHandlerEventPayload>) => {
      "worklet";
      initial.set(
        clamp((offset.get() - start) / Math.max(1, end - start), 0, 1) * travel,
      );
      dragging.set(true);
      bubble.set(true);
      activity.set(Date.now());
      bubbleActivity.set(Date.now());
      finger.set({ x: e.absoluteX, y: e.absoluteY });
      scheduleOnRN(onBegin);
    },
    [
      initial,
      offset,
      start,
      end,
      travel,
      dragging,
      bubble,
      activity,
      bubbleActivity,
      finger,
      onBegin,
    ],
  );
  const handleUpdate = useCallback(
    (e: GestureUpdateEvent<PanGestureHandlerEventPayload>) => {
      "worklet";
      const target = dragReadingOffset(
        initial.get(),
        e.translationY,
        travel,
        start,
        end,
      );
      const ratio = (target - start) / Math.max(1, end - start);
      finger.set({ x: e.absoluteX, y: e.absoluteY });
      offset.set(target);
      percent.set(ratio * 100);
      scrollTo(scrollRef, 0, target, false);
    },
    [initial, travel, start, end, finger, offset, percent, scrollRef],
  );
  const handleFinalize = useCallback(() => {
    "worklet";
    if (!dragging.get()) return;
    dragging.set(false);
    // Releasing the scrollbar starts the bubble's one-second countdown immediately.
    activity.set(Date.now());
    bubbleActivity.set(Date.now());
    scheduleOnRN(onEnd, offset.get());
  }, [dragging, activity, bubbleActivity, onEnd, offset]);
  const handleShortPress = useCallback(
    (e: { absoluteX: number; absoluteY: number }) => {
      "worklet";
      dragging.set(true);
      bubble.set(true);
      activity.set(Date.now());
      bubbleActivity.set(Date.now());
      finger.set({ x: e.absoluteX, y: e.absoluteY });
      scheduleOnRN(onBegin);
    },
    [dragging, bubble, activity, bubbleActivity, finger, onBegin],
  );
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .enabled(!disabled && travel > 0)
        .minDistance(0)
        // Gesture registration does not execute callbacks; scrollRef is read later on the UI thread.
        .onStart(handleStart)
        // eslint-disable-next-line react-hooks/refs
        .onUpdate(handleUpdate)
        .onFinalize(handleFinalize),
    [disabled, travel, handleStart, handleUpdate, handleFinalize],
  );
  const shortPress = useMemo(
    () =>
      Gesture.LongPress()
        .enabled(disabled)
        .minDuration(0)
        .shouldCancelWhenOutside(false)
        .onBegin(handleShortPress)
        .onFinalize(handleFinalize),
    [disabled, handleShortPress, handleFinalize],
  );
  const gesture = useMemo(
    () => Gesture.Exclusive(pan, shortPress),
    [pan, shortPress],
  );
  const step = (delta: number) => {
    onBegin();
    const target = clamp(offset.get() + (end - start) * delta, start, end);
    offset.set(target);
    scrollRef.current?.scrollTo({ y: target, animated: false });
    onEnd(target);
  };
  return (
    <GestureDetector gesture={gesture}>
      <Animated.View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel="快速阅读进度"
        accessibilityState={{ disabled }}
        accessibilityActions={[
          { name: "increment", label: "向下阅读" },
          { name: "decrement", label: "向上阅读" },
        ]}
        onAccessibilityAction={(e) => {
          if (!disabled)
            step(e.nativeEvent.actionName === "increment" ? 0.1 : -0.1);
        }}
        style={[
          {
            position: "absolute",
            top: 0,
            right: 0,
            width: 44,
            height: 50,
            justifyContent: "center",
          },
          style,
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            right: 4,
            width: 10,
            height: 50,
            borderRadius: 5,
            backgroundColor: colors.divider,
            alignItems: "center",
            justifyContent: "center",
            opacity: disabled ? 0.5 : 1,
          }}
        >
          <MoveVertical size={8} color={colors.textSecondary} />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

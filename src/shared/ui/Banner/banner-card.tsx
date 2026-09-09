import { useEffect } from "react";
import {
  ActivityIndicator,
  Pressable,
  Text,
  View,
  useColorScheme,
} from "react-native";
import {
  Check,
  CloudOff,
  Info,
  Sparkles,
  TriangleAlert,
  X,
} from "lucide-react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { bannerColors } from "@/shared/theme/banner";
import { LocalOnlyText } from "../local-only-text";

type Props = {
  title: string;
  message?: string;
  type: keyof typeof bannerColors.light;
  icon?: "check" | "info" | "warning" | "cloud-off" | "sparkles";
  progress?: { mode: "indeterminate" } | { mode: "determinate"; value: number };
  dismissible: boolean;
  busy: boolean;
  actionLabel?: string;
  bodyLabel?: string;
  onAction?: () => void;
  onBody?: () => void;
  onDismiss: () => void;
  onPause: (reason: string, paused: boolean) => void;
  remainingMs: number;
  durationMs: number;
  running: boolean;
  runningSince?: number | null;
};
const icons = {
  check: Check,
  info: Info,
  warning: TriangleAlert,
  "cloud-off": CloudOff,
  sparkles: Sparkles,
};

export function BannerCard(props: Props) {
  const { onPause, onDismiss, dismissible } = props;
  const palette =
    bannerColors[useColorScheme() === "dark" ? "dark" : "light"][props.type];
  const reduceMotion = useReducedMotion();
  const y = useSharedValue(0);
  const countdown = useSharedValue(1);
  useEffect(() => {
    cancelAnimation(countdown);
    const remaining = Math.max(
      0,
      props.remainingMs -
        (props.runningSince == null
          ? 0
          : performance.now() - props.runningSince),
    );
    countdown.set(props.durationMs ? remaining / props.durationMs : 0);
    if (props.running)
      countdown.set(
        withTiming(0, { duration: remaining, easing: Easing.linear }),
      );
  }, [
    countdown,
    props.remainingMs,
    props.durationMs,
    props.running,
    props.runningSince,
  ]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: y.get() }],
    opacity: 1 - Math.min(0.8, Math.abs(y.get()) / 140),
  }));
  const line = useAnimatedStyle(() => ({
    width: `${Math.max(0, countdown.get()) * 100}%`,
  }));
  const pan = Gesture.Pan()
    .enabled(dismissible)
    .activeOffsetY([-8, 10000])
    .failOffsetX([-18, 18])
    .onStart(() => {
      scheduleOnRN(onPause, "drag", true);
    })
    .onUpdate((event) => {
      y.set(Math.min(0, event.translationY));
    })
    .onEnd((event) => {
      if (event.translationY < -42 || event.velocityY < -650) {
        y.set(
          withTiming(-140, { duration: reduceMotion ? 0 : 160 }, (finished) => {
            if (finished) scheduleOnRN(onDismiss);
          }),
        );
      } else
        y.set(
          withSpring(0, {
            duration: 400,
            dampingRatio: 0.8,
            velocity: event.velocityY,
            reduceMotion: undefined,
          }),
        );
    })
    .onFinalize(() => {
      scheduleOnRN(onPause, "drag", false);
    });
  const Icon =
    icons[
      props.icon ??
        (props.type === "success"
          ? "check"
          : props.type === "important"
            ? "warning"
            : props.type === "special"
              ? "sparkles"
              : "info")
    ];
  const content = (
    <>
      <Text
        numberOfLines={2}
        style={{ color: palette.foreground, fontSize: 14, fontWeight: "600" }}
      >
        <LocalOnlyText>{props.title}</LocalOnlyText>
      </Text>
      {props.message && (
        <Text
          numberOfLines={3}
          style={{ color: palette.foreground, fontSize: 12, marginTop: 3 }}
        >
          <LocalOnlyText>{props.message}</LocalOnlyText>
        </Text>
      )}
      {props.progress?.mode === "determinate" && (
        <Text style={{ color: palette.foreground, fontSize: 12 }}>
          {Math.round(Math.max(0, Math.min(1, props.progress.value)) * 100)}%
        </Text>
      )}
    </>
  );
  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          {
            backgroundColor: palette.background,
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 4px 16px rgba(0,0,0,0.10)",
          },
          style,
        ]}
        onTouchStart={() => onPause("touch", true)}
        onTouchEnd={() => onPause("touch", false)}
        onTouchCancel={() => onPause("touch", false)}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingLeft: 14,
            paddingRight: 4,
            paddingVertical: 6,
            minHeight: 60,
            gap: 10,
          }}
        >
          <View accessible={false} style={{ width: 22, alignItems: "center" }}>
            {props.progress || props.busy ? (
              <ActivityIndicator color={palette.foreground} size="small" />
            ) : (
              <Icon size={21} color={palette.foreground} />
            )}
          </View>
          {props.onBody ? (
            <Pressable
              style={{ flex: 1, minHeight: 48, justifyContent: "center" }}
              onPress={props.onBody}
              disabled={props.busy}
              accessibilityRole="button"
              accessibilityLabel={`${props.title}。${props.message ?? ""}。${props.bodyLabel ?? ""}`}
              onFocus={() => onPause("focus", true)}
              onBlur={() => onPause("focus", false)}
            >
              {content}
            </Pressable>
          ) : (
            <View
              style={{ flex: 1, paddingVertical: 6 }}
              accessible
              accessibilityLabel={`${props.title}。${props.message ?? ""}`}
            >
              {content}
            </View>
          )}
          {props.onAction && (
            <Pressable
              onPress={props.onAction}
              disabled={props.busy}
              accessibilityRole="button"
              accessibilityLabel={props.actionLabel}
              onFocus={() => onPause("focus", true)}
              onBlur={() => onPause("focus", false)}
              style={{
                minWidth: 48,
                minHeight: 48,
                justifyContent: "center",
                alignItems: "center",
                opacity: props.busy ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  color: palette.foreground,
                  fontSize: 13,
                  fontWeight: "600",
                }}
              >
                {props.actionLabel}
              </Text>
            </Pressable>
          )}
          {dismissible && (
            <Pressable
              onPress={onDismiss}
              accessibilityRole="button"
              accessibilityLabel="关闭通知"
              onFocus={() => onPause("focus", true)}
              onBlur={() => onPause("focus", false)}
              style={{
                width: 48,
                height: 48,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={18} color={palette.foreground} />
            </Pressable>
          )}
        </View>
        {props.durationMs > 0 && (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: "absolute",
                bottom: 0,
                left: 0,
                height: 2,
                backgroundColor: palette.foreground,
                opacity: 0.5,
              },
              line,
            ]}
          />
        )}
      </Animated.View>
    </GestureDetector>
  );
}

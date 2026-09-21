import { colors } from "@/shared/theme";
import { useFocusEffect } from "expo-router";
import {
  ArrowDown,
  Check,
  CircleAlert,
  Cloud,
  CloudCheck,
  RefreshCw,
} from "lucide-react-native";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactElement,
} from "react";
import { AccessibilityInfo, StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { formatNoteSyncTime } from "../data/note-sync-history";

const HEADER_HEIGHT = 88;
const SPRING = { duration: 260, dampingRatio: 1 };
type Phase = "pull" | "ready" | "syncing" | "success" | "error";

type Props<Result> = {
  children: ReactElement;
  count: number;
  itemLabel: string;
  lastSyncTime: number | null;
  enabled: boolean;
  scrollOffset: SharedValue<number>;
  onRefresh: () => Promise<Result | undefined>;
  successMessage: (result: Result) => string;
};

/** The list stays virtualized; only a transform follows the finger on the UI thread. */
export default function NotesSyncHeader<Result>({
  children,
  count,
  itemLabel,
  lastSyncTime,
  enabled,
  scrollOffset,
  onRefresh,
  successMessage,
}: Props<Result>) {
  const [phase, setPhase] = useState<Phase>("pull");
  const [resultText, setResultText] = useState("");
  const [reduceMotion, setReduceMotion] = useState(true);
  const rotation = useSharedValue(0);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  useEffect(() => {
    rotation.set(0);
    if (phase === "syncing" && !reduceMotion) {
      rotation.set(
        withRepeat(
          withTiming(360, { duration: 1400, easing: Easing.linear }),
          -1,
        ),
      );
    }
    return () => cancelAnimation(rotation);
  }, [phase, reduceMotion, rotation]);
  const distance = useSharedValue(0);
  const locked = useSharedValue(false);
  const ready = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dragging = useSharedValue(false);
  const busy = useRef(false);
  const generation = useRef(0);
  const resultTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useFocusEffect(
    useCallback(() => {
      return () => {
        generation.current += 1;
        if (resultTimer.current) clearTimeout(resultTimer.current);
        cancelAnimation(distance);
        cancelAnimation(rotation);
        distance.set(0);
        locked.set(false);
        busy.current = false;
        dragging.set(false);
      };
    }, [distance, dragging, locked, rotation]),
  );

  const refresh = useCallback(async () => {
    if (busy.current || !enabled) return;
    busy.current = true;
    const currentGeneration = generation.current;
    locked.set(true);
    distance.set(withSpring(HEADER_HEIGHT, SPRING));
    setPhase("syncing");
    let result: Result | undefined;
    try {
      result = await onRefresh();
    } catch {
      // The result remains local to the list, including unexpected request errors.
    }
    if (currentGeneration !== generation.current) return;
    setPhase(result ? "success" : "error");
    setResultText(result ? successMessage(result) : "同步失败");
    resultTimer.current = setTimeout(
      () => {
        distance.set(withSpring(0, SPRING));
        locked.set(false);
        busy.current = false;
        resultTimer.current = null;
      },
      result ? 1600 : 3000,
    );
  }, [distance, enabled, locked, onRefresh, successMessage]);

  const pan = Gesture.Pan()
    .enabled(enabled)
    .manualActivation(true)
    .onTouchesDown((event, manager) => {
      dragging.set(false);
      if (
        locked.get() ||
        scrollOffset.get() > 1 ||
        event.numberOfTouches !== 1
      ) {
        manager.fail();
        return;
      }
      const touch = event.allTouches[0];
      startX.set(touch.absoluteX);
      startY.set(touch.absoluteY);
    })
    .onTouchesMove((event, manager) => {
      if (dragging.get()) return;
      if (event.numberOfTouches !== 1) {
        manager.fail();
        return;
      }
      const touch = event.allTouches[0];
      const dx = touch.absoluteX - startX.get();
      const dy = touch.absoluteY - startY.get();
      // Yield immediately to horizontal card actions and upward/ordinary scrolling.
      if (
        Math.abs(dx) > 8 ||
        dy < -4 ||
        scrollOffset.get() > 1 ||
        locked.get()
      ) {
        manager.fail();
      } else if (dy > 10) {
        manager.activate();
      }
    })
    .onStart(() => {
      dragging.set(true);
      cancelAnimation(distance);
      ready.set(false);
      runOnJS(setPhase)("pull");
    })
    .onUpdate((event) => {
      distance.set(
        Math.min(HEADER_HEIGHT * 1.5, Math.max(0, event.translationY * 0.5)),
      );
      const nextReady = distance.get() >= HEADER_HEIGHT;
      if (ready.get() !== nextReady) {
        ready.set(nextReady);
        runOnJS(setPhase)(nextReady ? "ready" : "pull");
      }
    })
    // RNGH registers this callback; refresh reads refs only after the gesture ends.
    // eslint-disable-next-line react-hooks/refs
    .onEnd((_event, success) => {
      if (success && ready.get()) {
        locked.set(true);
        distance.set(withSpring(HEADER_HEIGHT, SPRING));
        runOnJS(refresh)();
      }
    })
    .onFinalize(() => {
      dragging.set(false);
      if (!locked.get()) distance.set(withSpring(0, SPRING));
    });

  // Native scrolling waits only until the initial direction/top-position check resolves.
  const nativeScroll = Gesture.Native().requireExternalGestureToFail(pan);
  const listStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: distance.get() }],
  }));
  const headerStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, distance.get() / HEADER_HEIGHT),
    transform: [{ translateY: (distance.get() - HEADER_HEIGHT) / 2 }],
  }));
  const statusIconStyle = useAnimatedStyle(() => ({
    transform: [
      {
        rotate: `${phase === "syncing" && !reduceMotion ? rotation.get() : 0}deg`,
      },
    ],
  }));
  const message =
    phase === "syncing"
      ? "同步中"
      : phase === "ready"
        ? "松开同步"
        : phase === "pull"
          ? "下拉同步"
          : resultText;

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.container}>
        <Animated.View
          pointerEvents="none"
          style={[styles.header, headerStyle]}
        >
          <Text style={styles.count}> {count} 条{itemLabel}</Text>
          <View style={styles.details}>
            <View style={styles.status} accessibilityLiveRegion="polite">
              <Animated.View style={statusIconStyle}>
                {phase === "syncing" ? (
                  <RefreshCw size={15} color={colors.textSecondary} />
                ) : phase === "success" ? (
                  <Check size={15} color={colors.textSecondary} />
                ) : phase === "error" ? (
                  <CircleAlert size={15} color={colors.textSecondary} />
                ) : (
                  <ArrowDown size={15} color={colors.textSecondary} />
                )}
              </Animated.View>
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={styles.message}
              >
                {message}
              </Text>
            </View>
            <View style={styles.history}>
              {phase === "success" ? (
                <CloudCheck size={18} color={colors.textSecondary} />
              ) : (
                <Cloud size={18} color={colors.textSecondary} />
              )}
              <Text
                numberOfLines={1}
                ellipsizeMode="tail"
                style={styles.message}
              >
                {formatNoteSyncTime(lastSyncTime)}
              </Text>
            </View>
          </View>
        </Animated.View>
        <Animated.View style={[styles.list, listStyle]}>
          <GestureDetector gesture={nativeScroll}>{children}</GestureDetector>
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  list: { flex: 1 },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: HEADER_HEIGHT,
    justifyContent: "center",
    alignItems: "center",
    gap: 6,
  },
  count: { color: colors.textPrimary, fontSize: 16, fontWeight: "600" },
  details: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    gap: 24,
  },
  history: {
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 5,
  },
  status: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 6,
  },
  message: {
    color: colors.textSecondary,
    fontSize: 12,
    flexShrink: 1,
    textAlign: "center",
  },
});

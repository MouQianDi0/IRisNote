import { colors } from "@/shared/theme";
import MaskedView from "@react-native-masked-view/masked-view";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import {
  getFloatingMenuHidden,
  onFloatingMenuVisibilityChanged,
} from "../floating-menu-visibility";
import { TAB_MENU_ITEMS } from "../navigation.constants";
import FloatingActionButton from "./FloatingActionButton";
import type { SwipeTabsBarProps } from "./SwipeTabsNavigator";

const FADE_HEIGHT = 15;
const MENU_HEIGHT = 66;
const BOTTOM_SPACE = 20;
const BACKDROP_HEIGHT = FADE_HEIGHT + MENU_HEIGHT + BOTTOM_SPACE;
const SHADOW_CLEARANCE = 16;
const initialHiddenOffsetY = BACKDROP_HEIGHT + SHADOW_CLEARANCE;
const MENU_HORIZONTAL_PADDING = 8;
const NO_TAB_INDEX = -1;
const TAB_ICON_SIZE = 35;
const TAB_FOCUS_SCALE = 0.5;
const TAB_FOCUS_TRANSITION_DURATION = 200;

type TabClickRequest = {
  session: number;
  targetIndex: number;
};

function getTabIndexAtPosition(positionX: number, menuWidth: number) {
  "worklet";

  const contentWidth = menuWidth - MENU_HORIZONTAL_PADDING * 2;

  if (
    contentWidth <= 0 ||
    positionX < MENU_HORIZONTAL_PADDING ||
    positionX >= menuWidth - MENU_HORIZONTAL_PADDING
  ) {
    return NO_TAB_INDEX;
  }

  return Math.min(
    TAB_MENU_ITEMS.length - 1,
    Math.floor(
      (positionX - MENU_HORIZONTAL_PADDING) /
        (contentWidth / TAB_MENU_ITEMS.length),
    ),
  );
}

function getTabSelectionPosition(positionX: number, menuWidth: number) {
  "worklet";

  const contentWidth = menuWidth - MENU_HORIZONTAL_PADDING * 2;

  if (
    contentWidth <= 0 ||
    positionX < MENU_HORIZONTAL_PADDING ||
    positionX >= menuWidth - MENU_HORIZONTAL_PADDING
  ) {
    return NO_TAB_INDEX;
  }

  const tabWidth = contentWidth / TAB_MENU_ITEMS.length;
  const selectionPosition =
    (positionX - MENU_HORIZONTAL_PADDING) / tabWidth - 0.5;

  return Math.min(TAB_MENU_ITEMS.length - 1, Math.max(0, selectionPosition));
}

function getTabIndexByKey(tabKey: string) {
  const tabIndex = TAB_MENU_ITEMS.findIndex((item) => item.key === tabKey);

  return tabIndex === NO_TAB_INDEX ? 0 : tabIndex;
}

function getActiveIconOpacity(selectionPosition: number, tabIndex: number) {
  "worklet";

  return Math.max(0, 1 - Math.min(1, Math.abs(selectionPosition - tabIndex)));
}

function FloatingMenuTabIcon({
  icon: Icon,
  index,
  isTabDragging,
  navigationSession,
  selectionPosition,
  clickRequest,
}: {
  icon: (typeof TAB_MENU_ITEMS)[number]["icon"];
  index: number;
  isTabDragging: SharedValue<boolean>;
  navigationSession: SharedValue<number>;
  selectionPosition: SharedValue<number>;
  clickRequest: SharedValue<TabClickRequest>;
}) {
  const scale = useSharedValue(1);
  const clickScale = useSharedValue(1);

  useAnimatedReaction(
    () => isTabDragging.get() && Math.round(selectionPosition.get()) === index,
    (isFocused, wasFocused) => {
      if (wasFocused === null || isFocused === wasFocused) {
        return;
      }

      scale.set(
        withTiming(isFocused ? TAB_FOCUS_SCALE : 1, {
          duration: TAB_FOCUS_TRANSITION_DURATION,
        }),
      );
    },
  );

  const activeIconStyle = useAnimatedStyle(() => ({
    opacity: getActiveIconOpacity(selectionPosition.get(), index),
  }));
  const inactiveIconStyle = useAnimatedStyle(() => ({
    opacity: 1 - getActiveIconOpacity(selectionPosition.get(), index),
  }));
  const focusStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.get() }],
  }));
  const clickStyle = useAnimatedStyle(() => ({
    transform: [{ scale: clickScale.get() }],
  }));

  useAnimatedReaction(
    () => clickRequest.get(),
    (current, previous) => {
      const isTarget = current.targetIndex === index;
      const wasTarget = previous?.targetIndex === index;

      if (!isTarget) {
        if (wasTarget) {
          clickScale.set(
            withTiming(1, { duration: TAB_FOCUS_TRANSITION_DURATION }),
          );
        }
        return;
      }

      if (wasTarget && previous?.session === current.session) {
        return;
      }

      const session = current.session;

      clickScale.set(
        withTiming(
          TAB_FOCUS_SCALE,
          { duration: TAB_FOCUS_TRANSITION_DURATION },
          (shrunk) => {
            if (
              !shrunk ||
              navigationSession.get() !== session ||
              clickRequest.get().session !== session ||
              clickRequest.get().targetIndex !== index
            ) {
              return;
            }

            selectionPosition.set(index);
            clickScale.set(
              withTiming(
                1,
                { duration: TAB_FOCUS_TRANSITION_DURATION },
                (expanded) => {
                  if (
                    expanded &&
                    navigationSession.get() === session &&
                    clickRequest.get().session === session &&
                    clickRequest.get().targetIndex === index
                  ) {
                    clickRequest.set({
                      session,
                      targetIndex: NO_TAB_INDEX,
                    });
                  }
                },
              ),
            );
          },
        ),
      );
    },
  );

  return (
    <View style={styles.iconContainer}>
      <Animated.View style={[styles.iconMotion, focusStyle]}>
        <Animated.View style={[styles.iconClickMotion, clickStyle]}>
          <Animated.View style={[styles.iconLayer, inactiveIconStyle]}>
            <Icon size={TAB_ICON_SIZE} color={colors.textSecondary} />
          </Animated.View>
          <Animated.View style={[styles.iconLayer, activeIconStyle]}>
            <Icon size={TAB_ICON_SIZE} color={colors.floatingAccentOpaque} />
          </Animated.View>
        </Animated.View>
      </Animated.View>
    </View>
  );
}

export default function FloatingMenu({
  state,
  blurTarget,
  navigation,
}: SwipeTabsBarProps) {
  const activeTab = state.routes[state.index]?.name ?? "note";
  const activeTabIndex = getTabIndexByKey(activeTab);
  const hiddenOffsetY = useSharedValue(initialHiddenOffsetY);
  const menuWidth = useSharedValue(0);
  const tabSelectionPosition = useSharedValue(activeTabIndex);
  const isTabDragging = useSharedValue(false);
  const pendingNavigationProgress = useSharedValue(0);
  const navigationSession = useSharedValue(0);
  const clickRequest = useSharedValue<TabClickRequest>({
    session: 0,
    targetIndex: NO_TAB_INDEX,
  });
  const pendingClickTarget = useSharedValue(NO_TAB_INDEX);
  const translateY = useSharedValue(
    getFloatingMenuHidden() ? initialHiddenOffsetY : 0,
  );

  const navigateToTab = useCallback(
    (tabIndex: number) => {
      const item = TAB_MENU_ITEMS[tabIndex];

      if (!item) return;
      navigation.navigate(item.key);
    },
    [navigation],
  );

  const startClickAnimation = useCallback(
    (tabIndex: number) => {
      const session = navigationSession.get() + 1;

      navigationSession.set(session);
      pendingNavigationProgress.set(0);
      clickRequest.set({
        session,
        targetIndex: tabIndex,
      });
    },
    [clickRequest, navigationSession, pendingNavigationProgress],
  );

  useEffect(() => {
    if (!isTabDragging.get()) {
      tabSelectionPosition.set(activeTabIndex);
    }
  }, [activeTabIndex, isTabDragging, tabSelectionPosition]);

  useEffect(() => {
    if (pendingClickTarget.get() !== activeTabIndex) {
      return;
    }

    pendingClickTarget.set(NO_TAB_INDEX);
    startClickAnimation(activeTabIndex);
  }, [activeTabIndex, pendingClickTarget, startClickAnimation]);

  const tabDragGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-1, 1])
        .onStart((event) => {
          const session = navigationSession.get() + 1;

          pendingClickTarget.set(NO_TAB_INDEX);
          navigationSession.set(session);
          pendingNavigationProgress.set(0);
          clickRequest.set({
            session,
            targetIndex: NO_TAB_INDEX,
          });

          const selectionPosition = getTabSelectionPosition(
            event.x,
            menuWidth.get(),
          );

          isTabDragging.set(true);
          tabSelectionPosition.set(
            selectionPosition === NO_TAB_INDEX
              ? activeTabIndex
              : selectionPosition,
          );
        })
        .onUpdate((event) => {
          const selectionPosition = getTabSelectionPosition(
            event.x,
            menuWidth.get(),
          );

          tabSelectionPosition.set(
            selectionPosition === NO_TAB_INDEX
              ? activeTabIndex
              : selectionPosition,
          );
        })
        .onEnd((event, success) => {
          if (!success) {
            tabSelectionPosition.set(activeTabIndex);
            isTabDragging.set(false);
            return;
          }

          const tabIndex = getTabIndexAtPosition(event.x, menuWidth.get());

          if (tabIndex === NO_TAB_INDEX) {
            tabSelectionPosition.set(activeTabIndex);
            isTabDragging.set(false);
            return;
          }

          tabSelectionPosition.set(tabIndex);
          isTabDragging.set(false);
          const session = navigationSession.get();

          pendingNavigationProgress.set(0);
          pendingNavigationProgress.set(
            withTiming(
              1,
              {
                duration: TAB_FOCUS_TRANSITION_DURATION,
              },
              (finished) => {
                if (finished && navigationSession.get() === session) {
                  scheduleOnRN(navigateToTab, tabIndex);
                }
              },
            ),
          );
        })
        .onFinalize((_, success) => {
          if (!success) {
            isTabDragging.set(false);
            tabSelectionPosition.set(activeTabIndex);
            pendingNavigationProgress.set(0);
          }
        }),
    [
      activeTabIndex,
      clickRequest,
      isTabDragging,
      pendingClickTarget,
      menuWidth,
      navigateToTab,
      navigationSession,
      pendingNavigationProgress,
      tabSelectionPosition,
    ],
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
        <GestureDetector gesture={tabDragGesture}>
          <View
            className="h-[66] min-w-0 flex-1 flex-row items-center rounded-floating bg-white p-[8] shadow-md"
            onLayout={({ nativeEvent }) => {
              menuWidth.set(nativeEvent.layout.width);
            }}
          >
            {TAB_MENU_ITEMS.map((item, index) => (
              <Pressable
                key={index}
                accessibilityLabel={item.name}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeTab === item.key }}
                className={`h-[50] min-w-0 flex-1 items-center justify-center rounded-full ${
                  activeTab === item.key ? "opacity-100" : "opacity-70"
                }`}
                style={({ pressed }) =>
                  pressed ? { opacity: 0.7 } : undefined
                }
                onPress={() => {
                  if (activeTab === item.key) {
                    pendingClickTarget.set(NO_TAB_INDEX);
                    startClickAnimation(index);
                    return;
                  }

                  const session = navigationSession.get() + 1;

                  navigationSession.set(session);
                  pendingNavigationProgress.set(0);
                  clickRequest.set({
                    session,
                    targetIndex: NO_TAB_INDEX,
                  });
                  pendingClickTarget.set(index);
                  navigateToTab(index);
                }}
              >
                <FloatingMenuTabIcon
                  icon={item.icon}
                  index={index}
                  isTabDragging={isTabDragging}
                  navigationSession={navigationSession}
                  selectionPosition={tabSelectionPosition}
                  clickRequest={clickRequest}
                />
              </Pressable>
            ))}
          </View>
        </GestureDetector>
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
  iconContainer: {
    height: TAB_ICON_SIZE,
    width: TAB_ICON_SIZE,
  },
  iconMotion: {
    height: TAB_ICON_SIZE,
    width: TAB_ICON_SIZE,
  },
  iconClickMotion: {
    height: TAB_ICON_SIZE,
    width: TAB_ICON_SIZE,
  },
  iconLayer: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
});

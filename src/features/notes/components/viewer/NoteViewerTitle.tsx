import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import type { LayoutChangeEvent } from "react-native";
import { Pressable, Text, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export type NoteViewerTitleControls = {
  isTitleExpandable: boolean;
  chevronAnimatedStyle: ComponentProps<typeof Animated.View>["style"];
  onToggleTitleExpanded: () => void;
};

type NoteViewerTitleProps = {
  title: string;
  renderMeta: (controls: NoteViewerTitleControls) => ReactNode;
};

const TITLE_ANIMATION_DURATION = 240;
const TITLE_HEIGHT_EPSILON = 1;

export default function NoteViewerTitle({
  title,
  renderMeta,
}: NoteViewerTitleProps) {
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [showFullTitle, setShowFullTitle] = useState(false);
  const [collapsedTitleHeight, setCollapsedTitleHeight] = useState(0);
  const [expandedTitleHeight, setExpandedTitleHeight] = useState(0);
  const [titleAnimationReady, setTitleAnimationReady] = useState(false);
  const titleCollapseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const titleHeight = useSharedValue(0);
  const titleChevronRotation = useSharedValue(0);

  const isTitleMeasured = collapsedTitleHeight > 0 && expandedTitleHeight > 0;
  const isTitleExpandable =
    titleAnimationReady &&
    expandedTitleHeight > collapsedTitleHeight + TITLE_HEIGHT_EPSILON;

  const clearTitleCollapseTimer = useCallback(() => {
    if (titleCollapseTimerRef.current == null) {
      return;
    }

    clearTimeout(titleCollapseTimerRef.current);
    titleCollapseTimerRef.current = null;
  }, []);

  useLayoutEffect(() => {
    clearTitleCollapseTimer();
    setTitleExpanded(false);
    setShowFullTitle(false);
    setCollapsedTitleHeight(0);
    setExpandedTitleHeight(0);
    setTitleAnimationReady(false);
    titleHeight.value = 0;
    titleChevronRotation.value = 0;
  }, [clearTitleCollapseTimer, title, titleChevronRotation, titleHeight]);

  useEffect(() => {
    if (!isTitleMeasured || titleAnimationReady) {
      return;
    }

    const titleCanExpand =
      expandedTitleHeight > collapsedTitleHeight + TITLE_HEIGHT_EPSILON;
    titleHeight.value = titleCanExpand
      ? collapsedTitleHeight
      : expandedTitleHeight;
    titleChevronRotation.value = 0;
    setShowFullTitle(!titleCanExpand);
    setTitleAnimationReady(true);
  }, [
    collapsedTitleHeight,
    expandedTitleHeight,
    isTitleMeasured,
    titleAnimationReady,
    titleChevronRotation,
    titleHeight,
  ]);

  useEffect(() => {
    return () => {
      clearTitleCollapseTimer();
    };
  }, [clearTitleCollapseTimer]);

  const titleAnimatedStyle = useAnimatedStyle(() => ({
    height: titleHeight.value,
  }));

  const titleChevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${titleChevronRotation.value}deg` }],
  }));

  const handleCollapsedTitleLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);

    if (nextHeight <= 0) {
      return;
    }

    setCollapsedTitleHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight,
    );
  };

  const handleExpandedTitleLayout = (event: LayoutChangeEvent) => {
    const nextHeight = Math.ceil(event.nativeEvent.layout.height);

    if (nextHeight <= 0) {
      return;
    }

    setExpandedTitleHeight((currentHeight) =>
      currentHeight === nextHeight ? currentHeight : nextHeight,
    );
  };

  const toggleTitleExpanded = () => {
    if (!isTitleExpandable) {
      return;
    }

    clearTitleCollapseTimer();

    if (titleExpanded) {
      setTitleExpanded(false);
      titleHeight.value = withTiming(collapsedTitleHeight, {
        duration: TITLE_ANIMATION_DURATION,
      });
      titleChevronRotation.value = withTiming(0, {
        duration: TITLE_ANIMATION_DURATION,
      });
      titleCollapseTimerRef.current = setTimeout(() => {
        setShowFullTitle(false);
        titleCollapseTimerRef.current = null;
      }, TITLE_ANIMATION_DURATION);
      return;
    }

    setShowFullTitle(true);
    setTitleExpanded(true);
    titleHeight.value = withTiming(expandedTitleHeight, {
      duration: TITLE_ANIMATION_DURATION,
    });
    titleChevronRotation.value = withTiming(180, {
      duration: TITLE_ANIMATION_DURATION,
    });
  };

  return (
    <>
      <View pointerEvents="none" className="absolute left-0 right-0 opacity-0">
        <Text
          className="text-2xl font-bold text-gray-900"
          numberOfLines={3}
          ellipsizeMode="tail"
          onLayout={handleCollapsedTitleLayout}
        >
          {title}
        </Text>
        <Text
          className="text-2xl font-bold text-gray-900"
          onLayout={handleExpandedTitleLayout}
        >
          {title}
        </Text>
      </View>

      <Animated.View
        style={
          titleAnimationReady
            ? [{ overflow: "hidden" }, titleAnimatedStyle]
            : undefined
        }
      >
        <Pressable disabled={!isTitleExpandable} onPress={toggleTitleExpanded}>
          <Text
            selectable
            className="text-2xl font-bold text-gray-900"
            numberOfLines={showFullTitle ? undefined : 3}
            ellipsizeMode="tail"
          >
            {title}
          </Text>
        </Pressable>
      </Animated.View>

      {renderMeta({
        isTitleExpandable,
        chevronAnimatedStyle: titleChevronAnimatedStyle,
        onToggleTitleExpanded: toggleTitleExpanded,
      })}
    </>
  );
}

import { useState } from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { Bookmark } from "lucide-react-native";
import { colors } from "@/shared/theme";
import { bubblePosition } from "./progress-bubble-position";

const AnimatedInput = Animated.createAnimatedComponent(TextInput);
export type ProgressBubbleProps = {
  finger: SharedValue<{ x: number; y: number }>;
  percent: SharedValue<number>;
  origin: { x: number; y: number; width: number; height: number };
  heading?: string;
  bookmarks?: string[];
  onPress: () => void;
  onHold: (held: boolean) => void;
};
/** Coordinate overlay in the current window: no Modal is opened during a drag. */
export default function ProgressBubble({
  finger,
  percent,
  origin,
  heading,
  bookmarks = [],
  onPress,
  onHold,
}: ProgressBubbleProps) {
  const [size, setSize] = useState({ width: 100, height: 44 });
  const style = useAnimatedStyle(() => {
    const p = finger.get();
    const location = bubblePosition(
      p.x - origin.x,
      p.y - origin.y,
      size.width,
      size.height,
      { left: 0, top: 0, right: origin.width, bottom: origin.height },
    );
    return {
      transform: [{ translateX: location.left }, { translateY: location.top }],
    };
  });
  const animatedProps = useAnimatedProps<TextInputProps & { text: string }>(
    () => {
      const value = `${percent.get().toFixed(2)}%`;
      return { text: value, value };
    },
  );
  return (
    <Animated.View
      style={[
        {
          position: "absolute",
          top: 0,
          left: 0,
          maxWidth: Math.max(44, Math.min(200, origin.width - 16)),
        },
        style,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="阅读进度，打开大纲"
        onPress={onPress}
        onPressIn={() => onHold(true)}
        onPressOut={() => onHold(false)}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setSize((s) =>
            s.width === width && s.height === height ? s : { width, height },
          );
        }}
        style={{
          paddingHorizontal: 12,
          paddingVertical: 8,
          minHeight: 44,
          justifyContent: "center",
          borderRadius: 14,
          borderCurve: "continuous",
          borderWidth: 1,
          borderColor: colors.hyperDivider,
          backgroundColor: colors.surface,
          boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
        }}
      >
        {!!heading && (
          <Text
            numberOfLines={2}
            style={{ color: colors.textPrimary, fontSize: 14 }}
          >
            {heading}
          </Text>
        )}
        {bookmarks.map((name, index) => (
          <View
            key={index}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginTop: heading || index ? 4 : 0,
            }}
          >
            <Bookmark size={14} color={colors.primary} />
            <Text
              numberOfLines={2}
              style={{ flexShrink: 1, fontSize: 14, color: colors.textPrimary }}
            >
              {name || "书签"}
            </Text>
          </View>
        ))}
        {!heading && !bookmarks.length && (
          <AnimatedInput
            pointerEvents="none"
            editable={false}
            caretHidden
            accessible={false}
            underlineColorAndroid="transparent"
            animatedProps={animatedProps}
            style={{
              width: 84,
              height: 24,
              padding: 0,
              margin: 0,
              textAlign: "center",
              color: colors.textPrimary,
              fontSize: 14,
            }}
          />
        )}
      </Pressable>
    </Animated.View>
  );
}

import { useEffect } from "react";
import { CheckCircle2, Info, CircleAlert } from "lucide-react-native";
import { ActivityIndicator, Text, View } from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withTiming,
} from "react-native-reanimated";
import { defaultThemePreset, radii, semanticColors } from "@/shared/theme";
import type { CaptureFeedback } from "../domain/excerpt-capture-feedback";

/** 独立 Activity 上直接绘制反馈，避免 Modal 创建第二个抢焦点窗口。 */
export function ExcerptCaptureFeedback({
    feedback,
    leaving,
}: {
    feedback: CaptureFeedback | null;
    leaving: boolean;
}) {
    const opacity = useSharedValue(0);
    const scale = useSharedValue(0.96);
    useEffect(() => {
        opacity.set(
            withTiming(leaving ? 0 : 1, {
                duration: defaultThemePreset.motion.fastDuration,
            }),
        );
    }, [leaving, opacity]);
    useEffect(() => {
        scale.set(feedback?.tone === "success" ? 0.9 : 0.96);
        scale.set(
            withTiming(1, {
                duration: defaultThemePreset.motion.normalDuration,
            }),
        );
    }, [feedback, scale]);
    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.get(),
        transform: [{ scale: scale.get() }],
    }));
    const color =
        feedback?.tone === "error"
            ? semanticColors.destructive
            : feedback?.tone === "neutral"
              ? semanticColors.textSecondary
              : semanticColors.brandPrimary;
    const Icon =
        feedback?.tone === "success"
            ? CheckCircle2
            : feedback?.tone === "error"
              ? CircleAlert
              : Info;
    return (
        <View
            style={{
                flex: 1,
                justifyContent: "center",
                alignItems: "center",
                padding: 24,
            }}
            pointerEvents="none"
        >
            <Animated.View
                style={[
                    {
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 8,
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        borderRadius: radii.control,
                        backgroundColor: semanticColors.surface,
                        maxWidth: "100%",
                    },
                    animatedStyle,
                ]}
            >
                {feedback ? (
                    <Icon size={24} color={color} />
                ) : (
                    <ActivityIndicator
                        color={color}
                        style={{ width: 24, height: 24 }}
                    />
                )}
                <Text
                    accessibilityRole="alert"
                    accessibilityLiveRegion="polite"
                    style={{
                        flexShrink: 1,
                        fontSize: 14,
                        lineHeight: 20,
                        color,
                    }}
                >
                    {feedback?.message ?? "正在摘录…"}
                </Text>
            </Animated.View>
        </View>
    );
}

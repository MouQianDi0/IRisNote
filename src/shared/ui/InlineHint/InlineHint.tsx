import { componentRecipes } from "@/shared/theme";
import type { ComponentType } from "react";
import {
    Pressable,
    type AccessibilityState,
    type Insets,
    type PressableProps,
    View,
} from "react-native";
import { AppText } from "../AppText";

type HintIconProps = {
    size?: number;
    color?: string;
};

export type InlineHintTone = "neutral" | "important";
export type InlineHintSize = "compact" | "standard";

export type InlineHintProps = {
    icon: ComponentType<HintIconProps>;
    message: string;
    tone?: InlineHintTone;
    /** `compact` is the default supplementary-copy size; `standard` matches status actions. */
    size?: InlineHintSize;
    /** When supplied, the hint becomes a pressable status/action row. */
    onPress?: PressableProps["onPress"];
    disabled?: boolean;
    accessibilityLabel?: string;
    accessibilityState?: AccessibilityState;
    hitSlop?: Insets | number;
    className?: string;
};

const sizeSpecs: Record<InlineHintSize, { iconSize: number; gap: number }> = {
    compact: { iconSize: 14, gap: 6 },
    standard: { iconSize: 20, gap: 4 },
};

/** Single-line supplementary guidance, optionally pressable when an event is supplied. */
export function InlineHint({
    icon: Icon,
    message,
    tone = "neutral",
    size = "compact",
    onPress,
    disabled = false,
    accessibilityLabel,
    accessibilityState,
    hitSlop,
    className,
}: InlineHintProps) {
    const recipe = componentRecipes.inlineHint[tone];
    const spec = sizeSpecs[size];
    const content = (
        <>
            <Icon size={spec.iconSize} color={recipe.content} />
            <AppText
                className="flex-1"
                variant="helper"
                tone={tone === "important" ? "danger" : "secondary"}
                numberOfLines={1}
                ellipsizeMode="tail"
            >
                {message}
            </AppText>
        </>
    );
    const layoutStyle = {
        alignItems: "center" as const,
        flexDirection: "row" as const,
        gap: spec.gap,
    };

    if (!onPress) {
        return (
            <View className={className} style={layoutStyle}>
                {content}
            </View>
        );
    }

    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? message}
            accessibilityState={{ ...accessibilityState, disabled }}
            disabled={disabled}
            onPress={onPress}
            hitSlop={hitSlop}
            className={className}
            style={({ pressed }) => [
                layoutStyle,
                { opacity: pressed && !disabled ? 0.85 : 1 },
            ]}
        >
            {content}
        </Pressable>
    );
}

import {
    componentRecipes,
    defaultThemePreset,
    radii,
} from "@/shared/theme";
import type { ReactNode } from "react";
import {
    ActivityIndicator,
    Pressable,
    type PressableProps,
    View,
    type ViewStyle,
} from "react-native";
import { AppText, type AppTextTone } from "../AppText";

export type AppButtonVariant =
    | "primary"
    | "secondary"
    | "tonal"
    | "danger"
    | "text";
export type AppButtonSize = "standard" | "compact";

export type AppButtonProps = Omit<
    PressableProps,
    "children" | "disabled" | "style"
> & {
    label: string;
    variant?: AppButtonVariant;
    size?: AppButtonSize;
    leading?: ReactNode;
    loading?: boolean;
    loadingLabel?: string;
    disabled?: boolean;
    onPress: NonNullable<PressableProps["onPress"]>;
    className?: string;
};

const BUTTON_HEIGHTS: Record<AppButtonSize, number> = {
    standard: 48,
    compact: 44,
};

const contentTones: Record<
    AppButtonVariant,
    { default: AppTextTone; disabled: AppTextTone }
> = {
    primary: { default: "onBrand", disabled: "onPrimaryDisabled" },
    secondary: { default: "primary", disabled: "disabled" },
    tonal: { default: "brand", disabled: "primaryFaded" },
    danger: {
        default: "onDanger",
        disabled: "onDestructiveDisabled",
    },
    text: { default: "brand", disabled: "primaryFaded" },
};

const baseStyle: ViewStyle = {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: radii.control,
    flexDirection: "row",
    gap: 8,
    justifyContent: "center",
    paddingHorizontal: 16,
};

/** Semantic application button with theme-owned color, shape and states. */
export function AppButton({
    label,
    variant = "primary",
    size = "standard",
    leading,
    loading = false,
    loadingLabel,
    disabled = false,
    accessibilityLabel,
    accessibilityState,
    className,
    ...props
}: AppButtonProps) {
    const unavailable = disabled || loading;
    const state = disabled ? "disabled" : "default";
    const recipe = componentRecipes.button[variant][state];
    const tone = contentTones[variant][state];
    const visibleLabel = loading ? (loadingLabel ?? label) : label;

    return (
        <View className={className}>
            <Pressable
                {...props}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel ?? label}
                accessibilityState={{
                    ...accessibilityState,
                    busy: loading,
                    disabled: unavailable,
                }}
                disabled={unavailable}
                style={({ pressed }) => [
                    baseStyle,
                    {
                        alignSelf: "stretch",
                        backgroundColor: recipe.background,
                        height: BUTTON_HEIGHTS[size],
                        opacity:
                            pressed && !unavailable
                                ? defaultThemePreset.motion.pressedOpacity
                                : 1,
                    },
                ]}
            >
                {loading ? (
                    <ActivityIndicator size="small" color={recipe.content} />
                ) : (
                    leading
                )}
                <AppText
                    variant="control"
                    tone={tone}
                    numberOfLines={1}
                    className="shrink"
                >
                    {visibleLabel}
                </AppText>
            </Pressable>
        </View>
    );
}

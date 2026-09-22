import { componentRecipes, defaultThemePreset, radii } from "@/shared/theme";
import type { ComponentType } from "react";
import {
    ActivityIndicator,
    Pressable,
    type Insets,
    type PressableProps,
    type ViewStyle,
} from "react-native";

export type AppIconProps = {
    size?: number;
    color?: string;
};

export type IconButtonVariant = "ghost" | "tonal" | "selected";
export type IconButtonSize = "compact" | "standard";

export type IconButtonProps = Omit<
    PressableProps,
    "children" | "disabled" | "style"
> & {
    icon: ComponentType<AppIconProps>;
    accessibilityLabel: string;
    size?: IconButtonSize;
    iconSize?: number;
    variant?: IconButtonVariant;
    selected?: boolean;
    loading?: boolean;
    disabled?: boolean;
    onPress: NonNullable<PressableProps["onPress"]>;
    className?: string;
};

const BUTTON_SIZES: Record<IconButtonSize, number> = {
    compact: 40,
    standard: 48,
};

const COMPACT_HIT_SLOP: Insets = {
    bottom: 2,
    left: 2,
    right: 2,
    top: 2,
};

const baseStyle: ViewStyle = {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: radii.iconControl,
    justifyContent: "center",
};

/** Theme-owned icon action with a mandatory accessible name. */
export function IconButton({
    icon: Icon,
    accessibilityLabel,
    size = "standard",
    iconSize = 24,
    variant = "ghost",
    selected = false,
    loading = false,
    disabled = false,
    accessibilityState,
    className,
    hitSlop,
    ...props
}: IconButtonProps) {
    const unavailable = disabled || loading;
    const isSelected = selected || variant === "selected";
    const visualVariant = isSelected ? "selected" : variant;
    const state = disabled ? "disabled" : "default";
    const recipe = componentRecipes.iconButton[visualVariant][state];
    const dimension = BUTTON_SIZES[size];

    return (
        <Pressable
            {...props}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{
                ...accessibilityState,
                busy: loading,
                disabled: unavailable,
                selected: isSelected,
            }}
            disabled={unavailable}
            hitSlop={
                hitSlop ?? (size === "compact" ? COMPACT_HIT_SLOP : undefined)
            }
            className={className}
            style={({ pressed }) => [
                baseStyle,
                {
                    backgroundColor: recipe.background,
                    height: dimension,
                    opacity:
                        pressed && !unavailable
                            ? defaultThemePreset.motion.pressedOpacity
                            : 1,
                    width: dimension,
                },
            ]}
        >
            {loading ? (
                <ActivityIndicator size="small" color={recipe.content} />
            ) : (
                <Icon size={iconSize} color={recipe.content} />
            )}
        </Pressable>
    );
}

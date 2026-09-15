import {
    componentRecipes,
    defaultThemePreset,
    radii,
} from "@/shared/theme";
import type { ComponentType } from "react";
import {
    Pressable,
    type PressableProps,
    View,
    type ViewStyle,
} from "react-native";
import { AppText, type AppTextTone } from "../AppText";

type StatusToggleIcon = ComponentType<{
    size?: number;
    color?: string;
}>;

export type StatusToggleProps = Omit<
    PressableProps,
    "children" | "disabled" | "style"
> & {
    label: string;
    icon: StatusToggleIcon;
    selected?: boolean;
    disabled?: boolean;
    onPress: NonNullable<PressableProps["onPress"]>;
    className?: string;
};

const ICON_SIZE = 20;

const baseStyle: ViewStyle = {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: radii.control,
    flexDirection: "row",
    gap: 8,
    height: 48,
    justifyContent: "center",
    paddingHorizontal: 16,
};

/** Icon+label capsule toggling a persisted status such as pin/star. */
export function StatusToggle({
    label,
    icon: Icon,
    selected = false,
    disabled = false,
    accessibilityLabel,
    accessibilityState,
    className,
    ...props
}: StatusToggleProps) {
    const variant = selected ? "selected" : "tonal";
    const state = disabled ? "disabled" : "default";
    const recipe = componentRecipes.iconButton[variant][state];
    const tone: AppTextTone = disabled
        ? "disabled"
        : selected
          ? "brand"
          : "primary";

    return (
        <View className={className}>
            <Pressable
                {...props}
                accessibilityRole="button"
                accessibilityLabel={accessibilityLabel ?? label}
                accessibilityState={{
                    ...accessibilityState,
                    disabled,
                    selected,
                }}
                disabled={disabled}
                style={({ pressed }) => [
                    baseStyle,
                    {
                        alignSelf: "stretch",
                        backgroundColor: recipe.background,
                        opacity:
                            pressed && !disabled
                                ? defaultThemePreset.motion.pressedOpacity
                                : 1,
                    },
                ]}
            >
                <Icon size={ICON_SIZE} color={recipe.content} />
                <AppText
                    variant="control"
                    tone={tone}
                    numberOfLines={1}
                    className="shrink"
                >
                    {label}
                </AppText>
            </Pressable>
        </View>
    );
}

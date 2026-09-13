import {
    componentRecipes,
    defaultThemePreset,
    radii,
} from "@/shared/theme";
import { ArrowLeft } from "lucide-react-native";
import {
    ActivityIndicator,
    Pressable,
    type PressableProps,
    type ViewStyle,
} from "react-native";
import { AppText } from "../AppText";
import { IconButton, type IconButtonProps } from "../IconButton";

export type BackButtonProps = Omit<
    IconButtonProps,
    "accessibilityLabel" | "icon" | "iconSize" | "selected" | "variant"
> & {
    label?: string;
    accessibilityLabel?: string;
};

const labelStyle: ViewStyle = {
    alignItems: "center",
    alignSelf: "flex-start",
    borderCurve: "continuous",
    borderRadius: radii.iconControl,
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 8,
};

/** Visual back entry only; navigation and exit ordering remain business-owned. */
export function BackButton({
    label,
    accessibilityLabel = label ?? "返回",
    loading = false,
    disabled = false,
    size = "compact",
    accessibilityState,
    className,
    onPress,
    ...props
}: BackButtonProps) {
    if (!label) {
        return (
            <IconButton
                {...props}
                icon={ArrowLeft}
                iconSize={24}
                size={size}
                variant="ghost"
                accessibilityLabel={accessibilityLabel}
                accessibilityState={accessibilityState}
                className={className}
                loading={loading}
                disabled={disabled}
                onPress={onPress}
            />
        );
    }

    const unavailable = disabled || loading;
    const state = disabled ? "disabled" : "default";
    const recipe = componentRecipes.iconButton.ghost[state];

    return (
        <Pressable
            {...props}
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            accessibilityState={{
                ...accessibilityState,
                busy: loading,
                disabled: unavailable,
            }}
            disabled={unavailable}
            hitSlop={size === "compact" ? 2 : undefined}
            className={className}
            onPress={onPress as PressableProps["onPress"]}
            style={({ pressed }) => [
                labelStyle,
                {
                    backgroundColor: recipe.background,
                    height: size === "compact" ? 40 : 48,
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
                <ArrowLeft size={24} color={recipe.content} />
            )}
            <AppText
                variant="control"
                tone={disabled ? "disabled" : "primary"}
            >
                {label}
            </AppText>
        </Pressable>
    );
}

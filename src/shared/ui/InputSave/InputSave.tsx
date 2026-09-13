import {
    componentRecipes,
    defaultThemePreset,
    radii,
    semanticColors,
} from "@/shared/theme";
import { Save } from "lucide-react-native";
import { forwardRef } from "react";
import {
    ActivityIndicator,
    Pressable,
    TextInput,
    View,
    type ViewStyle,
} from "react-native";
import { Input, type InputProps } from "../Input";

export type InputSaveProps = Omit<
    InputProps,
    "containerClassName" | "trailing"
> & {
    onSave: () => void;
    saving?: boolean;
    saveAccessibilityLabel?: string;
    containerClassName?: string;
};

const rowStyle: ViewStyle = {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
    minWidth: 0,
};

const saveButtonStyle: ViewStyle = {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: radii.iconControl,
    height: 52,
    justifyContent: "center",
    width: 52,
};

/** A 52dp input paired with one theme-owned save action. */
export const InputSave = forwardRef<TextInput, InputSaveProps>(
    function InputSave(
        {
            onSave,
            saving = false,
            saveAccessibilityLabel = "保存",
            containerClassName,
            disabled = false,
            ...inputProps
        },
        ref,
    ) {
        const unavailable = disabled || saving;
        const recipe = componentRecipes.iconButton.tonal[
            disabled ? "disabled" : "default"
        ];
        const iconColor = unavailable
            ? semanticColors.textDisabled
            : semanticColors.textSecondary;

        return (
            <View className={containerClassName} style={rowStyle}>
                <Input
                    {...inputProps}
                    ref={ref}
                    disabled={unavailable}
                    containerClassName="h-[52px] min-w-0 flex-1"
                />
                <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={saveAccessibilityLabel}
                    accessibilityState={{
                        busy: saving,
                        disabled: unavailable,
                    }}
                    disabled={unavailable}
                    onPress={onSave}
                    style={({ pressed }) => [
                        saveButtonStyle,
                        {
                            backgroundColor: recipe.background,
                            opacity:
                                pressed && !unavailable
                                    ? defaultThemePreset.motion.pressedOpacity
                                    : 1,
                        },
                    ]}
                >
                    {saving ? (
                        <ActivityIndicator size="small" color={iconColor} />
                    ) : (
                        <Save size={20} color={iconColor} />
                    )}
                </Pressable>
            </View>
        );
    },
);

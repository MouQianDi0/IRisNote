import {
    componentRecipes,
    semanticColors,
    themeTypography,
    radii,
} from "@/shared/theme";
import { X } from "lucide-react-native";
import { forwardRef, useState, type ReactNode } from "react";
import {
    TextInput,
    View,
    type TextInputProps,
    type ViewStyle,
} from "react-native";
import { IconButton } from "../IconButton";

export type InputProps = Omit<
    TextInputProps,
    "className" | "editable" | "style"
> & {
    invalid?: boolean;
    leading?: ReactNode;
    trailing?: ReactNode;
    clearable?: boolean;
    readOnly?: boolean;
    disabled?: boolean;
    inputClassName?: string;
    containerClassName?: string;
};

const containerBaseStyle: ViewStyle = {
    borderCurve: "continuous",
    borderRadius: radii.field,
    borderWidth: 2,
    flexDirection: "row",
    gap: 8,
    minWidth: 0,
};

/** Controlled or uncontrolled ordinary form input; editor inputs stay separate. */
export const Input = forwardRef<TextInput, InputProps>(function Input(
    {
        invalid = false,
        leading,
        trailing,
        clearable = false,
        readOnly = false,
        disabled = false,
        multiline = false,
        inputClassName,
        containerClassName,
        onFocus,
        onBlur,
        onChangeText,
        value,
        placeholderTextColor,
        selectionColor,
        accessibilityState,
        ...props
    },
    ref,
) {
    const [focused, setFocused] = useState(false);
    const state = disabled
        ? "disabled"
        : readOnly
          ? "readOnly"
          : invalid
            ? "invalid"
            : focused
              ? "focused"
              : "default";
    const recipe = componentRecipes.input[state];
    const showClear =
        clearable &&
        !disabled &&
        !readOnly &&
        typeof value === "string" &&
        value.length > 0;

    const handleFocus: NonNullable<TextInputProps["onFocus"]> = (event) => {
        setFocused(true);
        onFocus?.(event);
    };

    const handleBlur: NonNullable<TextInputProps["onBlur"]> = (event) => {
        setFocused(false);
        onBlur?.(event);
    };

    return (
        <View
            className={containerClassName}
            style={[
                containerBaseStyle,
                {
                    alignItems: multiline ? "flex-start" : "center",
                    backgroundColor: recipe.background,
                    borderColor: recipe.border,
                    minHeight: multiline ? 96 : 48,
                },
            ]}
        >
            {!!leading && (
                <View className={multiline ? "ml-3 mt-3" : "ml-3"}>
                    {leading}
                </View>
            )}
            <TextInput
                {...props}
                ref={ref}
                value={value}
                multiline={multiline}
                editable={!disabled}
                readOnly={readOnly}
                aria-invalid={invalid}
                accessibilityState={{
                    ...accessibilityState,
                    disabled,
                }}
                placeholderTextColor={
                    placeholderTextColor ??
                    (disabled
                        ? semanticColors.textDisabled
                        : semanticColors.textSecondary)
                }
                selectionColor={selectionColor ?? semanticColors.brandPrimary}
                className={inputClassName}
                style={[
                    themeTypography.control,
                    {
                        color: recipe.content,
                        flex: 1,
                        minWidth: 0,
                        paddingBottom: multiline ? 12 : 0,
                        paddingLeft: leading ? 0 : 16,
                        paddingRight: trailing || showClear ? 0 : 16,
                        paddingTop: multiline ? 12 : 0,
                        textAlignVertical: multiline ? "top" : "center",
                    },
                ]}
                onChangeText={onChangeText}
                onFocus={handleFocus}
                onBlur={handleBlur}
            />
            {showClear && (
                <IconButton
                    icon={X}
                    iconSize={20}
                    size="standard"
                    variant="ghost"
                    accessibilityLabel="清空输入"
                    onPress={() => onChangeText?.("")}
                />
            )}
            {!!trailing && !showClear && (
                <View pointerEvents={disabled ? "none" : "auto"}>
                    {trailing}
                </View>
            )}
        </View>
    );
});

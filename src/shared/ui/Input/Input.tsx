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
    /** Body fields share ordinary input state recipes without changing existing callers. */
    size?: "standard" | "compact" | "body";
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
        size = "standard",
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
                    minHeight:
                        size === "body"
                            ? 144
                            : multiline
                              ? 96
                              : size === "compact"
                                ? 44
                                : 48,
                    height: size === "body" ? 144 : undefined,
                },
            ]}
        >
            {!!leading && (
                <View className={multiline ? "mt-3 ml-3" : "ml-3"}>
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
                        fontSize:
                            size === "body"
                                ? 17
                                : themeTypography.control.fontSize,
                        height: size === "body" ? "100%" : undefined,
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
                <View
                    collapsable={false}
                    pointerEvents={disabled ? "none" : "auto"}
                >
                    {trailing}
                </View>
            )}
        </View>
    );
});

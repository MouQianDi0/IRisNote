import { colors } from "@/shared/theme";
import { Eye, EyeOff } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import {
    Pressable,
    Text,
    TextInput,
    View,
    type TextInputProps,
} from "react-native";
import { tv } from "tailwind-variants";

const fieldStyles = tv({
    base: "h-12 min-w-0 flex-1 flex-row items-center rounded-hyper-card border bg-hyper-card",
    variants: {
        state: {
            idle: "border-transparent",
            focused: "border-primary",
            invalid: "border-hyper-error",
        },
    },
});

type AuthFieldProps = TextInputProps & {
    label: string;
    error?: string;
    password?: boolean;
    action?: ReactNode;
};

export function AuthField({
    label,
    error,
    password = false,
    action,
    editable = true,
    onFocus,
    onBlur,
    ...props
}: AuthFieldProps) {
    const [focused, setFocused] = useState(false);
    const [touched, setTouched] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const visibleError = touched ? error : undefined;
    return (
        <View>
            <Text className="mb-2 text-sm text-hyper-text-secondary">
                {label}
            </Text>
            <View className="flex-row items-center gap-2.5">
                <View
                    className={fieldStyles({
                        state: visibleError
                            ? "invalid"
                            : focused
                              ? "focused"
                              : "idle",
                    })}
                >
                    <TextInput
                        {...props}
                        accessibilityLabel={label}
                        aria-invalid={!!visibleError}
                        editable={editable}
                        autoCapitalize="none"
                        autoCorrect={false}
                        placeholderTextColor={colors.hyperTextSecondary}
                        secureTextEntry={password && !revealed}
                        className="h-full min-w-0 flex-1 px-4 py-0 text-[17px] text-black web:outline-none"
                        onFocus={(event) => {
                            setFocused(true);
                            onFocus?.(event);
                        }}
                        onBlur={(event) => {
                            setFocused(false);
                            setTouched(true);
                            onBlur?.(event);
                        }}
                    />
                    {password && (
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`${revealed ? "隐藏" : "显示"}${label}`}
                            accessibilityState={{ disabled: !editable }}
                            disabled={!editable}
                            onPress={() => setRevealed((value) => !value)}
                            className="h-12 w-12 items-center justify-center active:opacity-85"
                        >
                            {revealed ? (
                                <EyeOff
                                    size={20}
                                    color={colors.hyperTextSecondary}
                                />
                            ) : (
                                <Eye
                                    size={20}
                                    color={colors.hyperTextSecondary}
                                />
                            )}
                        </Pressable>
                    )}
                </View>
                {action}
            </View>
            {!!visibleError && (
                <Text
                    accessibilityRole="alert"
                    className="mt-1.5 text-sm text-hyper-error"
                >
                    {visibleError}
                </Text>
            )}
        </View>
    );
}

import {
    AppText,
    IconButton,
    Input,
    type InputProps,
} from "@/shared/ui";
import { Eye, EyeOff } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { View } from "react-native";

type AuthFieldProps = Omit<
    InputProps,
    "disabled" | "invalid" | "leading" | "trailing"
> & {
    label: string;
    error?: string;
    password?: boolean;
    action?: ReactNode;
    editable?: boolean;
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
    const [touched, setTouched] = useState(false);
    const [revealed, setRevealed] = useState(false);
    const visibleError = touched ? error : undefined;
    return (
        <View>
            <AppText variant="helper" tone="secondary" className="mb-2">
                {label}
            </AppText>
            <View className="flex-row items-center gap-2.5">
                <Input
                    {...props}
                    accessibilityLabel={label}
                    disabled={!editable}
                    invalid={!!visibleError}
                    autoCapitalize="none"
                    autoCorrect={false}
                    secureTextEntry={password && !revealed}
                    containerClassName="min-w-0 flex-1"
                    inputClassName="web:outline-none"
                    trailing={
                        password ? (
                            <IconButton
                                icon={revealed ? EyeOff : Eye}
                                iconSize={20}
                                accessibilityLabel={`${revealed ? "隐藏" : "显示"}${label}`}
                                disabled={!editable}
                                onPress={() =>
                                    setRevealed((value) => !value)
                                }
                            />
                        ) : undefined
                    }
                    onFocus={onFocus}
                    onBlur={(event) => {
                        setTouched(true);
                        onBlur?.(event);
                    }}
                />
                {action}
            </View>
            {!!visibleError && (
                <AppText
                    accessibilityRole="alert"
                    variant="helper"
                    tone="danger"
                    className="mt-1.5"
                >
                    {visibleError}
                </AppText>
            )}
        </View>
    );
}

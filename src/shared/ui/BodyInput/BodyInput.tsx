import { forwardRef } from "react";
import { Text, TextInput, View } from "react-native";
import { semanticColors } from "@/shared/theme";
import { Input, type InputProps } from "../Input";

export type BodyInputProps = Pick<
    InputProps,
    | "value"
    | "onChangeText"
    | "placeholder"
    | "invalid"
    | "disabled"
    | "accessibilityLabel"
    | "onFocus"
    | "onBlur"
> & { maxLength?: number };

/** Bounded multiline text with Input's focus/error recipes; lengths use Unicode code points. */
export const BodyInput = forwardRef<TextInput, BodyInputProps>(
    function BodyInput({ maxLength, value, onChangeText, ...props }, ref) {
        const count = Array.from((value ?? "").replace(/\r\n?/g, "\n")).length;
        return (
            <View>
                <Input
                    {...props}
                    ref={ref}
                    size="body"
                    multiline
                    scrollEnabled
                    value={value}
                    onChangeText={(text) => {
                        const normalized = text.replace(/\r\n?/g, "\n");
                        onChangeText?.(
                            maxLength === undefined
                                ? normalized
                                : Array.from(normalized)
                                      .slice(0, maxLength)
                                      .join(""),
                        );
                    }}
                />
                {maxLength !== undefined && (
                    <Text
                        style={{
                            marginTop: 6,
                            fontSize: 13,
                            color: semanticColors.textSecondary,
                            textAlign: "right",
                        }}
                        accessibilityLabel={`${count} 字，上限 ${maxLength} 字`}
                    >
                        {count}/{maxLength}
                    </Text>
                )}
            </View>
        );
    },
);

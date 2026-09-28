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
> & {
    maxLength?: number;
    /** false: keep over-limit input and show the count as an error; the caller rejects it on save. */
    truncate?: boolean;
    /** Counting rule for the counter; defaults to code points after newline normalization. */
    measure?: (value: string) => number;
};

const codePoints = (value: string) =>
    Array.from(value.replace(/\r\n?/g, "\n")).length;

/** Bounded multiline text with Input's focus/error recipes; lengths use Unicode code points. */
export const BodyInput = forwardRef<TextInput, BodyInputProps>(
    function BodyInput(
        {
            maxLength,
            truncate = true,
            measure = codePoints,
            value,
            onChangeText,
            ...props
        },
        ref,
    ) {
        const count = measure(value ?? "");
        const over = maxLength !== undefined && count > maxLength;
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
                            maxLength === undefined || !truncate
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
                            color: over
                                ? semanticColors.destructive
                                : semanticColors.textSecondary,
                            textAlign: "right",
                        }}
                        accessibilityLabel={`${count} 字，上限 ${maxLength} 字${over ? "，已超出" : ""}`}
                    >
                        {count}/{maxLength}
                    </Text>
                )}
            </View>
        );
    },
);

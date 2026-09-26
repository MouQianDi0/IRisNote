import { useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { semanticColors, radii } from "@/shared/theme";
import { AppButton } from "../AppButton";
import { FormDialog } from "../Dialog/FormDialog";

const ROW_HEIGHT = 48;
const pad = (value: number) => String(value).padStart(2, "0");

function TimeWheel({
    count,
    value,
    onChange,
    label,
}: {
    count: number;
    value: number;
    onChange: (value: number) => void;
    label: string;
}) {
    const ref = useRef<ScrollView>(null);
    const [initialIndex] = useState(value);
    return (
        <View
            style={{
                flex: 1,
                height: ROW_HEIGHT * 5,
                borderRadius: radii.control,
                overflow: "hidden",
                backgroundColor: semanticColors.surfaceControl,
            }}
        >
            <View
                pointerEvents="none"
                style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: ROW_HEIGHT * 2,
                    height: ROW_HEIGHT,
                    backgroundColor: semanticColors.surfaceSelected,
                }}
            />
            <ScrollView
                ref={ref}
                style={{ flex: 1 }}
                contentOffset={{ x: 0, y: initialIndex * ROW_HEIGHT }}
                nestedScrollEnabled
                contentContainerStyle={{ paddingVertical: ROW_HEIGHT * 2 }}
                snapToInterval={ROW_HEIGHT}
                decelerationRate="fast"
                showsVerticalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={(event) =>
                    onChange(
                        Math.max(
                            0,
                            Math.min(
                                count - 1,
                                Math.round(
                                    event.nativeEvent.contentOffset.y /
                                        ROW_HEIGHT,
                                ),
                            ),
                        ),
                    )
                }
            >
                {Array.from({ length: count }, (_, item) => (
                    <Pressable
                        key={item}
                        accessibilityRole="button"
                        accessibilityLabel={`${item}${label}`}
                        accessibilityState={{ selected: item === value }}
                        onPress={() => {
                            ref.current?.scrollTo({
                                y: item * ROW_HEIGHT,
                                animated: true,
                            });
                            onChange(item);
                        }}
                        style={{
                            height: ROW_HEIGHT,
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <Text
                            style={{
                                fontSize: 20,
                                color:
                                    item === value
                                        ? semanticColors.brandPrimary
                                        : semanticColors.textSecondary,
                                fontVariant: ["tabular-nums"],
                            }}
                        >
                            {pad(item)}
                        </Text>
                    </Pressable>
                ))}
            </ScrollView>
        </View>
    );
}

function TimePicker({
    label,
    value,
    onChange,
    onClose,
}: {
    label: string;
    value: string | null;
    onChange: (value: string | null) => void;
    onClose: () => void;
}) {
    const now = new Date();
    const [hour, setHour] = useState(
        value ? Number(value.slice(0, 2)) : now.getHours(),
    );
    const [minute, setMinute] = useState(
        value ? Number(value.slice(3)) : now.getMinutes(),
    );
    return (
        <FormDialog
            onClose={onClose}
            title={
                <Text
                    accessibilityRole="header"
                    style={{ fontSize: 24, color: semanticColors.textPrimary }}
                >
                    {label}
                </Text>
            }
            actions={
                <View style={{ flexDirection: "row", gap: 10 }}>
                    <AppButton
                        className="flex-1"
                        variant="secondary"
                        label="取消"
                        onPress={onClose}
                    />
                    <AppButton
                        className="flex-1"
                        label="确定"
                        onPress={() => {
                            onChange(`${pad(hour)}:${pad(minute)}`);
                            onClose();
                        }}
                    />
                </View>
            }
        >
            <ScrollView style={{ flexShrink: 1 }} nestedScrollEnabled>
                <View style={{ flexDirection: "row", gap: 10 }}>
                    <TimeWheel
                        count={24}
                        value={hour}
                        onChange={setHour}
                        label="时"
                    />
                    <TimeWheel
                        count={60}
                        value={minute}
                        onChange={setMinute}
                        label="分"
                    />
                </View>
                <AppButton
                    variant="text"
                    label="清除时间"
                    onPress={() => {
                        onChange(null);
                        onClose();
                    }}
                />
            </ScrollView>
        </FormDialog>
    );
}

export type TimePickerFieldProps = {
    label: string;
    value: string | null;
    onChange: (value: string | null) => void;
    disabled?: boolean;
};
export function TimePickerField({
    label,
    value,
    onChange,
    disabled = false,
}: TimePickerFieldProps) {
    const [open, setOpen] = useState(false);
    return (
        <View style={{ flex: 1, minWidth: 0 }}>
            <Pressable
                accessibilityLabel={`${label}，${value ?? "未设置"}`}
                accessibilityRole="button"
                accessibilityState={{ disabled }}
                disabled={disabled}
                onPress={() => setOpen(true)}
                style={{
                    minHeight: 48,
                    paddingHorizontal: 12,
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 4,
                    borderRadius: radii.control,
                    borderCurve: "continuous",
                    backgroundColor: semanticColors.surfaceControl,
                }}
            >
                <Text
                    style={{
                        flexShrink: 1,
                        fontSize: 14,
                        color: disabled
                            ? semanticColors.textDisabled
                            : semanticColors.textSecondary,
                    }}
                >
                    {label}
                </Text>
                <Text
                    style={{
                        fontSize: 14,
                        color: disabled
                            ? semanticColors.textDisabled
                            : semanticColors.textPrimary,
                        fontVariant: ["tabular-nums"],
                    }}
                >
                    {value ?? "未设置"}
                </Text>
            </Pressable>
            {open && (
                <TimePicker
                    label={label}
                    value={value}
                    onChange={onChange}
                    onClose={() => setOpen(false)}
                />
            )}
        </View>
    );
}

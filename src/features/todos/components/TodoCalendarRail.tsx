import { Undo2 } from "lucide-react-native";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";

import { defaultThemePreset, radii, semanticColors } from "@/shared/theme";
import { AnchoredPopover, AppCalendar } from "@/shared/ui";
import {
    addDays,
    addWeeks,
    startOfWeekId,
    todayDateId,
    weekdayLabels,
} from "@/shared/utils/date-id";

const DAY_WIDTH = 50;
const DAY_HEIGHT = 50;
const DAY_GAP = 6;
const DAYS_PER_WEEK = 7;
const WEEK_SWIPE_DISTANCE = 24;
const WEEK_SWIPE_VELOCITY = 450;
const CHINESE_MONTH_LABELS = [
    "一月",
    "二月",
    "三月",
    "四月",
    "五月",
    "六月",
    "七月",
    "八月",
    "九月",
    "十月",
    "十一月",
    "十二月",
] as const;

type TodoCalendarRailProps = {
    value: string | null;
    onChange: (dateId: string) => void;
    todayId?: string;
    /** 受控：当前可见周首日（周一）；不传时组件内部自持。 */
    weekId?: string;
    /** 受控：可见周变化（滑动换周或选中其他周的日期）时回调。 */
    onWeekChange?: (weekId: string) => void;
};

/**
 * 待办页右侧日期轨道：固定展示周一至周日七项，上滑下一周、下滑上一周；
 * 月份标题跟随当前周内的选中日期；底部按钮返回今天所在周并选中今天。
 * 可见周可由外部受控（weekId/onWeekChange），供列表跟随周视图展示。
 */
export function TodoCalendarRail({
    value,
    onChange,
    todayId = todayDateId(),
    weekId,
    onWeekChange,
}: TodoCalendarRailProps) {
    const [internalWeekId, setInternalWeekId] = useState(() =>
        startOfWeekId(value ?? todayId, "monday"),
    );
    const visibleWeekId = weekId ?? internalWeekId;
    const [pickerVisible, setPickerVisible] = useState(false);
    const previousToday = useRef(todayId);
    const monthAnchorRef = useRef<View>(null);

    useLayoutEffect(() => {
        if (weekId !== undefined) return;
        if (previousToday.current !== todayId && value === null)
            setInternalWeekId(startOfWeekId(todayId, "monday"));
        previousToday.current = todayId;
    }, [todayId, value, weekId]);

    const weekdays = useMemo(
        () => weekdayLabels("monday").map((label) => `周${label}`),
        [],
    );
    const dates = useMemo(
        () =>
            Array.from({ length: DAYS_PER_WEEK }, (_, index) =>
                addDays(visibleWeekId, index),
            ),
        [visibleWeekId],
    );
    const activeDateId =
        value && dates.includes(value)
            ? value
            : dates.includes(todayId)
              ? todayId
              : (dates[3] ?? visibleWeekId);
    const monthLabel =
        CHINESE_MONTH_LABELS[Number(activeDateId.slice(5, 7)) - 1] ?? "";
    const isAtToday =
        visibleWeekId === startOfWeekId(todayId, "monday") &&
        (value === null || value === todayId);

    const shiftWeek = useCallback(
        (weeks: number) => {
            if (weekId !== undefined) {
                onWeekChange?.(addWeeks(weekId, weeks));
                return;
            }
            setInternalWeekId((current) => addWeeks(current, weeks));
        },
        [weekId, onWeekChange],
    );

    const weekSwipeGesture = useMemo(
        () =>
            Gesture.Pan()
                .activeOffsetY([-12, 12])
                .failOffsetX([-18, 18])
                .onEnd((event) => {
                    if (
                        event.translationY <= -WEEK_SWIPE_DISTANCE ||
                        event.velocityY <= -WEEK_SWIPE_VELOCITY
                    ) {
                        scheduleOnRN(shiftWeek, 1);
                        return;
                    }
                    if (
                        event.translationY >= WEEK_SWIPE_DISTANCE ||
                        event.velocityY >= WEEK_SWIPE_VELOCITY
                    ) {
                        scheduleOnRN(shiftWeek, -1);
                    }
                }),
        [shiftWeek],
    );

    const selectDate = (dateId: string) => {
        const nextWeekId = startOfWeekId(dateId, "monday");
        if (weekId !== undefined) {
            if (nextWeekId !== weekId) onWeekChange?.(nextWeekId);
        } else setInternalWeekId(nextWeekId);
        onChange(dateId);
    };

    const selectFromPicker = (
        next: string | { startDateId: string; endDateId: string } | null,
    ) => {
        if (typeof next !== "string") return;
        selectDate(next);
        setPickerVisible(false);
    };

    return (
        <View className="items-center">
            <Pressable
                ref={monthAnchorRef}
                accessibilityLabel={`当前显示${monthLabel}，快速跳转日期`}
                accessibilityRole="button"
                accessibilityState={{ expanded: pickerVisible }}
                onPress={() => setPickerVisible(true)}
                style={{
                    alignItems: "center",
                    height: DAY_WIDTH,
                    justifyContent: "center",
                    width: DAY_WIDTH,
                }}
            >
                <Text className="text-text-primary text-[17px]">
                    {monthLabel}
                </Text>
            </Pressable>
            <View className="my-[8px] h-[2px] w-[28px] rounded-full bg-divider opacity-80" />

            <GestureDetector gesture={weekSwipeGesture}>
                <View style={{ gap: DAY_GAP, width: DAY_WIDTH }}>
                    {dates.map((dateId, index) => {
                        const isToday = dateId === todayId;
                        const isSelected = !isToday && dateId === value;
                        const backgroundColor = isToday
                            ? semanticColors.brandPrimary
                            : isSelected
                              ? semanticColors.surfaceSelected
                              : "transparent";
                        const textColor = isToday
                            ? semanticColors.onBrandPrimary
                            : isSelected
                              ? semanticColors.brandPrimary
                              : semanticColors.textPrimary;
                        const weekday = weekdays[index] ?? "";

                        return (
                            <Pressable
                                key={dateId}
                                accessibilityLabel={`${dateId}，${weekday}${isToday ? "，今天" : ""}${isSelected ? "，已选中" : ""}`}
                                accessibilityRole="button"
                                accessibilityState={{
                                    selected: isToday || isSelected,
                                }}
                                onPress={() => selectDate(dateId)}
                                style={({ pressed }) => ({
                                    alignItems: "center",
                                    backgroundColor,
                                    borderCurve: "continuous",
                                    borderRadius: radii.control,
                                    height: DAY_HEIGHT,
                                    justifyContent: "center",
                                    opacity: pressed
                                        ? defaultThemePreset.motion
                                              .pressedOpacity
                                        : 1,
                                    width: DAY_WIDTH,
                                })}
                            >
                                <Text
                                    style={{
                                        color: textColor,
                                        fontSize: 11,
                                        lineHeight: 14,
                                    }}
                                >
                                    {weekday}
                                </Text>
                                <Text
                                    style={{
                                        color: textColor,
                                        fontSize: 16,
                                        lineHeight: 20,
                                    }}
                                >
                                    {dateId.slice(-2)}
                                </Text>
                            </Pressable>
                        );
                    })}
                </View>
            </GestureDetector>

            <View style={{ marginTop: DAY_GAP }}>
                {isAtToday ? (
                    <View style={{ height: DAY_HEIGHT, width: DAY_WIDTH }} />
                ) : (
                    <Pressable
                        accessibilityLabel="返回今天"
                        accessibilityRole="button"
                        onPress={() => selectDate(todayId)}
                        style={({ pressed }) => ({
                            alignItems: "center",
                            backgroundColor: semanticColors.brandPrimary,
                            borderCurve: "continuous",
                            borderRadius: radii.control,
                            height: DAY_HEIGHT,
                            justifyContent: "center",
                            opacity: pressed
                                ? defaultThemePreset.motion.pressedOpacity
                                : 1,
                            width: DAY_WIDTH,
                        })}
                    >
                        <Undo2
                            size={22}
                            color={semanticColors.onBrandPrimary}
                        />
                    </Pressable>
                )}
            </View>

            <AnchoredPopover
                accessibilityLabel="日期跳转"
                anchorRef={monthAnchorRef}
                maxHeight={440}
                onClose={() => setPickerVisible(false)}
                visible={pickerVisible}
                width={368}
            >
                <ScrollView
                    contentContainerStyle={{ padding: 12 }}
                    showsVerticalScrollIndicator={false}
                    style={{ maxHeight: 416 }}
                >
                    <AppCalendar
                        initialMonthId={activeDateId}
                        onChange={selectFromPicker}
                        value={value ?? todayId}
                        viewMode="month"
                    />
                </ScrollView>
            </AnchoredPopover>
        </View>
    );
}

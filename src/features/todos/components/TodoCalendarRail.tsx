import { useCallback, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { Undo2 } from "lucide-react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { scheduleOnRN } from "react-native-worklets";

import { AnchoredPopover, AppCalendar } from "@/shared/ui";
import { defaultThemePreset, radii, semanticColors } from "@/shared/theme";
import {
  addDays,
  addWeeks,
  startOfWeekId,
  todayDateId,
  weekdayLabels,
} from "@/shared/utils/date-id";

const DAY_SIZE = 50;
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
};

/**
 * 待办页右侧日期轨道：固定展示周一至周日七项，上滑下一周、下滑上一周；
 * 月份标题跟随当前周内的选中日期；底部按钮返回今天所在周并选中今天。
 */
export function TodoCalendarRail({ value, onChange }: TodoCalendarRailProps) {
  const todayId = todayDateId();
  const [visibleWeekId, setVisibleWeekId] = useState(() =>
    startOfWeekId(value ?? todayId, "monday"),
  );
  const [pickerVisible, setPickerVisible] = useState(false);
  const monthAnchorRef = useRef<View>(null);

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

  const shiftWeek = useCallback((weeks: number) => {
    setVisibleWeekId((weekId) => addWeeks(weekId, weeks));
  }, []);

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
    setVisibleWeekId(startOfWeekId(dateId, "monday"));
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
          height: DAY_SIZE,
          justifyContent: "center",
          width: DAY_SIZE,
        }}
      >
        <Text className="text-[17px] text-text-primary">{monthLabel}</Text>
      </Pressable>
      <View className="my-[8px] h-[2px] w-[28px] rounded-full bg-divider opacity-80" />

      <GestureDetector gesture={weekSwipeGesture}>
        <View style={{ gap: 2, width: DAY_SIZE }}>
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
                accessibilityState={{ selected: isToday || isSelected }}
                onPress={() => selectDate(dateId)}
                style={({ pressed }) => ({
                  alignItems: "center",
                  backgroundColor,
                  borderCurve: "continuous",
                  borderRadius: radii.control,
                  height: DAY_SIZE,
                  justifyContent: "center",
                  opacity: pressed
                    ? defaultThemePreset.motion.pressedOpacity
                    : 1,
                  width: DAY_SIZE,
                })}
              >
                <Text style={{ color: textColor, fontSize: 11, lineHeight: 14 }}>
                  {weekday}
                </Text>
                <Text style={{ color: textColor, fontSize: 16, lineHeight: 20 }}>
                  {dateId.slice(-2)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </GestureDetector>

      <View style={{ marginTop: 8 }}>
        {isAtToday ? (
          <View style={{ height: DAY_SIZE, width: DAY_SIZE }} />
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
              height: DAY_SIZE,
              justifyContent: "center",
              opacity: pressed ? defaultThemePreset.motion.pressedOpacity : 1,
              width: DAY_SIZE,
            })}
          >
            <Undo2 size={22} color={semanticColors.onBrandPrimary} />
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

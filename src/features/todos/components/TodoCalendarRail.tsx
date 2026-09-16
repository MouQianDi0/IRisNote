import { useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { ChevronLeft } from "lucide-react-native";

import { AnchoredPopover, AppCalendar, IconButton } from "@/shared/ui";
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
const WEEK_PAGE_HEIGHT = DAY_SIZE * DAYS_PER_WEEK;

type TodoCalendarRailProps = {
  value: string | null;
  onChange: (dateId: string) => void;
};

/**
 * 待办页右侧日期轨道：固定展示一周七日，上下分页翻周；
 * 月历仅作为快速跳转入口，避免将待办页专属状态色扩散到公共日历。
 */
export function TodoCalendarRail({ value, onChange }: TodoCalendarRailProps) {
  const todayId = todayDateId();
  const [visibleWeekId, setVisibleWeekId] = useState(() =>
    startOfWeekId(value ?? todayId, "monday"),
  );
  const [pickerVisible, setPickerVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const jumpAnchorRef = useRef<View>(null);

  const weeks = useMemo(
    () => [addWeeks(visibleWeekId, -1), visibleWeekId, addWeeks(visibleWeekId, 1)],
    [visibleWeekId],
  );
  const weekdays = useMemo(() => weekdayLabels("monday"), []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ y: WEEK_PAGE_HEIGHT, animated: false });
  }, [visibleWeekId]);

  const selectDate = (dateId: string) => {
    setVisibleWeekId(startOfWeekId(dateId, "monday"));
    onChange(dateId);
  };

  const handleWeekPageSettled = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
  ) => {
    const page = Math.round(event.nativeEvent.contentOffset.y / WEEK_PAGE_HEIGHT);
    if (page === 0) {
      setVisibleWeekId((weekId) => addWeeks(weekId, -1));
    } else if (page === 2) {
      setVisibleWeekId((weekId) => addWeeks(weekId, 1));
    }
  };

  const selectFromPicker = (next: string | { startDateId: string; endDateId: string } | null) => {
    if (typeof next !== "string") return;
    selectDate(next);
    setPickerVisible(false);
  };

  return (
    <View className="items-center pt-[30px]">
      <ScrollView
        ref={scrollRef}
        decelerationRate="fast"
        onMomentumScrollEnd={handleWeekPageSettled}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        style={{ height: WEEK_PAGE_HEIGHT, width: DAY_SIZE }}
      >
        {weeks.map((weekId) => (
          <View key={weekId} style={{ height: WEEK_PAGE_HEIGHT }}>
            {Array.from({ length: DAYS_PER_WEEK }, (_, index) => {
              const dateId = addDays(weekId, index);
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
                  accessibilityLabel={`${dateId}，星期${weekday}${isToday ? "，今天" : ""}${isSelected ? "，已选中" : ""}`}
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
                    opacity: pressed ? defaultThemePreset.motion.pressedOpacity : 1,
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
        ))}
      </ScrollView>

      <View ref={jumpAnchorRef} className="mt-2">
        <IconButton
          accessibilityLabel="快速跳转日期"
          icon={ChevronLeft}
          iconSize={20}
          onPress={() => setPickerVisible(true)}
          size="compact"
          variant="ghost"
        />
      </View>

      <AnchoredPopover
        accessibilityLabel="日期跳转"
        anchorRef={jumpAnchorRef}
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
          <Text accessibilityRole="header" className="mb-2 text-[17px] text-text-primary">
            跳转日期
          </Text>
          <AppCalendar
            initialMonthId={value ?? todayId}
            onChange={selectFromPicker}
            value={value ?? todayId}
            viewMode="month"
          />
        </ScrollView>
      </AnchoredPopover>
    </View>
  );
}

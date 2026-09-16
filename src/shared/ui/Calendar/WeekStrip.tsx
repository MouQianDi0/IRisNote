import { useEffect, useMemo, useRef, useState } from "react";
import {
    type NativeScrollEvent,
    type NativeSyntheticEvent,
    ScrollView,
    View,
} from "react-native";

import {
    buildCalendar,
    Calendar,
    type CalendarActiveDateRange,
    type CalendarDayMetadata,
} from "@marceloterreiro/flash-calendar";

import { semanticColors } from "@/shared/theme";
import {
    addWeeks,
    startOfWeekId,
    toMonthId,
    weekdayLabels,
} from "@/shared/utils/date-id";

import { buildWeekWindow } from "./calendar-logic";
import {
    appCalendarTheme,
    CALENDAR_METRICS,
    formatCalendarDay,
    formatCalendarMonth,
    formatCalendarWeekDay,
} from "./flash-calendar-theme";

/** 滚动窗口半径与边缘扩展步长（页）。 */
const WINDOW_RADIUS = 3;
const EDGE_THRESHOLD = 1;

export type WeekStripProps = {
    /** 当前周首日 ID（已按 firstDayOfWeek 归一）。 */
    weekAnchorId: string;
    firstDayOfWeek: "monday" | "sunday";
    activeRanges: CalendarActiveDateRange[];
    minDateId?: string;
    maxDateId?: string;
    disabledDateIds?: string[];
    onDayPress: (dateId: string) => void;
    onWeekChange: (weekStartId: string) => void;
    /** 网格（页）宽度。 */
    width: number;
};

/**
 * 收起态周条：左右分页翻周（跨月日期正常渲染），滚动窗口在边缘静默重建实现近似无限翻页。
 * 日格复用 flash-calendar 的 Calendar.Item.Day，与月视图共享同一套主题。
 * 锚定周跳出现有窗口时由父级换 key 重挂载（如收起归位），本组件不做状态回写。
 */
export function WeekStrip({
    weekAnchorId,
    firstDayOfWeek,
    activeRanges,
    minDateId,
    maxDateId,
    disabledDateIds,
    onDayPress,
    onWeekChange,
    width,
}: WeekStripProps) {
    const anchorWeek = startOfWeekId(weekAnchorId, firstDayOfWeek);
    const minWeekId = minDateId
        ? startOfWeekId(minDateId, firstDayOfWeek)
        : undefined;
    const maxWeekId = maxDateId
        ? startOfWeekId(maxDateId, firstDayOfWeek)
        : undefined;

    const [centerWeekId, setCenterWeekId] = useState(anchorWeek);
    const weeks = useMemo(
        () =>
            buildWeekWindow(
                centerWeekId,
                WINDOW_RADIUS,
                addWeeks,
                minWeekId,
                maxWeekId,
            ),
        [centerWeekId, maxWeekId, minWeekId],
    );

    const scrollRef = useRef<ScrollView>(null);
    const didInitialScrollRef = useRef(false);
    const pendingScrollWeekRef = useRef<string | null>(null);
    const lastSettlePageRef = useRef(-1);

    const rows = useMemo(
        () =>
            weeks.map((weekId) => {
                const { weeksList } = buildCalendar({
                    calendarMonthId: toMonthId(weekId),
                    calendarFirstDayOfWeek: firstDayOfWeek,
                    calendarMinDateId: minDateId,
                    calendarMaxDateId: maxDateId,
                    calendarDisabledDateIds: disabledDateIds,
                    calendarActiveDateRanges: activeRanges,
                    getCalendarDayFormat: formatCalendarDay,
                    getCalendarMonthFormat: formatCalendarMonth,
                    getCalendarWeekDayFormat: formatCalendarWeekDay,
                });
                const row =
                    weeksList.find((week) => week[0]?.id === weekId) ?? [];
                return row satisfies CalendarDayMetadata[];
            }),
        [
            activeRanges,
            disabledDateIds,
            firstDayOfWeek,
            maxDateId,
            minDateId,
            weeks,
        ],
    );

    // 首次布局与窗口重建后无感归位（scrollTo 属外部系统同步，不在渲染期写状态）
    useEffect(() => {
        if (width <= 0 || weeks.length === 0) {
            return;
        }
        if (!didInitialScrollRef.current) {
            const index = weeks.indexOf(anchorWeek);
            if (index >= 0) {
                didInitialScrollRef.current = true;
                scrollRef.current?.scrollTo({
                    x: index * width,
                    animated: false,
                });
            }
            return;
        }
        const target = pendingScrollWeekRef.current;
        if (!target) {
            return;
        }
        const index = weeks.indexOf(target);
        if (index >= 0) {
            pendingScrollWeekRef.current = null;
            scrollRef.current?.scrollTo({
                x: index * width,
                animated: false,
            });
        }
    }, [anchorWeek, weeks, width]);

    const handleSettle = (
        event: NativeSyntheticEvent<NativeScrollEvent>,
    ): void => {
        if (width <= 0 || weeks.length === 0) {
            return;
        }
        const raw = Math.round(event.nativeEvent.contentOffset.x / width);
        const page = Math.max(0, Math.min(raw, weeks.length - 1));
        if (page === lastSettlePageRef.current) {
            return;
        }
        lastSettlePageRef.current = page;
        const settledWeek = weeks[page];
        if (!settledWeek) {
            return;
        }
        if (settledWeek !== anchorWeek) {
            onWeekChange(settledWeek);
        }
        // 逼近窗口边缘时以落定周为中心静默重建
        if (
            page <= EDGE_THRESHOLD ||
            page >= weeks.length - 1 - EDGE_THRESHOLD
        ) {
            setCenterWeekId(settledWeek);
            pendingScrollWeekRef.current = settledWeek;
            lastSettlePageRef.current = -1;
        }
    };

    if (width <= 0) {
        return null;
    }

    return (
        <View style={{ alignSelf: "center", width }}>
            <View
                style={{
                    borderBottomColor: semanticColors.divider,
                    borderBottomWidth: CALENDAR_METRICS.dividerWidth,
                    flexDirection: "row",
                    height: CALENDAR_METRICS.weekdayHeaderHeight,
                }}
            >
                {weekdayLabels(firstDayOfWeek).map((label, index) => (
                    <Calendar.Item.WeekName
                        height={CALENDAR_METRICS.weekdayHeaderHeight}
                        key={index}
                        theme={appCalendarTheme.itemWeekName}
                    >
                        {label}
                    </Calendar.Item.WeekName>
                ))}
            </View>
            <ScrollView
                contentContainerStyle={{ width: width * weeks.length }}
                horizontal
                onMomentumScrollEnd={handleSettle}
                onScrollEndDrag={handleSettle}
                pagingEnabled
                ref={scrollRef}
                showsHorizontalScrollIndicator={false}
                style={{ width }}
            >
                {rows.map((row, index) => (
                    <View
                        key={weeks[index]}
                        style={{ flexDirection: "row", width }}
                    >
                        {row.map((cell) => (
                            <View
                                key={cell.id}
                                style={{
                                    flex: 1,
                                    height: CALENDAR_METRICS.dayCellSize,
                                }}
                            >
                                <Calendar.Item.Day
                                    height={CALENDAR_METRICS.dayCellSize}
                                    metadata={cell}
                                    onPress={onDayPress}
                                    theme={appCalendarTheme.itemDay}
                                >
                                    {cell.displayLabel}
                                </Calendar.Item.Day>
                            </View>
                        ))}
                    </View>
                ))}
            </ScrollView>
        </View>
    );
}

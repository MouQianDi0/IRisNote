import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    PanResponder,
    type View as ViewType,
    View,
} from "react-native";

import { buildCalendar, Calendar } from "@marceloterreiro/flash-calendar";
import { ChevronLeft, ChevronRight } from "lucide-react-native";

import { AppText } from "@/shared/ui/AppText";
import { IconButton } from "@/shared/ui/IconButton";
import {
    formatMonthTitle,
    startOfWeekId,
    toMonthId,
    todayDateId,
} from "@/shared/utils/date-id";

import {
    anchorDateId,
    collapseWeekId,
    expandMonthId,
    nextRangeValue,
    nextSingleValue,
    rangePhaseFromValue,
    type RangePhase,
    resolveInitialMonthId,
    shiftMonthWithinBounds,
    toActiveDateRanges,
    type CalendarValue,
} from "./calendar-logic";
import {
    appCalendarTheme,
    CALENDAR_METRICS,
    formatCalendarDay,
    formatCalendarMonth,
    formatCalendarWeekDay,
} from "./flash-calendar-theme";
import { WeekStrip } from "./WeekStrip";

export type CalendarDateId = string;
export type AppCalendarViewMode = "week" | "month";

export type AppCalendarProps = {
    /** 选值模式，默认 single。 */
    mode?: "single" | "range";
    /** 受控值：single 传 DateId | null；range 传 CalendarRange | null。 */
    value?: CalendarValue;
    /** 非受控初值（未传 value 时生效）。 */
    initialValue?: CalendarValue;
    onChange?: (value: CalendarValue) => void;
    /** 初始显示月份，缺省取 value 所在月再退到当月。 */
    initialMonthId?: CalendarDateId;
    /** 早于该日禁用且不可翻到更早月份。 */
    minDateId?: CalendarDateId;
    /** 晚于该日禁用且不可翻到更晚月份。 */
    maxDateId?: CalendarDateId;
    disabledDateIds?: CalendarDateId[];
    /** 默认 monday。 */
    firstDayOfWeek?: "monday" | "sunday";
    /** 月视图标题行导航按钮，默认 true；周视图不渲染标题行。 */
    showMonthNav?: boolean;
    onVisibleMonthChange?: (monthId: CalendarDateId) => void;
    /** 受控视图形态。 */
    viewMode?: AppCalendarViewMode;
    /** 初始视图形态，默认 month。 */
    initialViewMode?: AppCalendarViewMode;
    onViewModeChange?: (viewMode: AppCalendarViewMode) => void;
    /** 仅布局扩展（外边距、对齐），禁止覆盖颜色与圆角。 */
    className?: string;
};

/** 月视图整体高度：标题 44 + 间距 4 + 表头 32 + k 行 × 48 + (k-1) × 4。 */
const computeMonthHeight = (
    monthId: string,
    firstDayOfWeek: "monday" | "sunday",
): number => {
    const { weeksList } = buildCalendar({
        calendarMonthId: monthId,
        calendarFirstDayOfWeek: firstDayOfWeek,
    });
    const rows = weeksList.length;
    return (
        CALENDAR_METRICS.monthTitleRowHeight +
        CALENDAR_METRICS.weekRowGap +
        CALENDAR_METRICS.weekdayHeaderHeight +
        CALENDAR_METRICS.dayCellSize * rows +
        CALENDAR_METRICS.weekRowGap * (rows - 1)
    );
};

/** 周条高度：表头 32 + 单周行 48。 */
const STRIP_HEIGHT =
    CALENDAR_METRICS.weekdayHeaderHeight + CALENDAR_METRICS.dayCellSize;

/** 垂直滑动判定阈值与切换动画时长。 */
const SWIPE_THRESHOLD = 14;
const VIEW_ANIMATION_DURATION = 220;

/**
 * 日历公共组件：周视图（左右翻周）/ 月视图（导航翻月）双形态，
 * 下滑展开、上滑收起；视觉与契约见 docs/UI/日历公共组件规范.md。
 */
export function AppCalendar({
    mode = "single",
    value,
    initialValue,
    onChange,
    initialMonthId,
    minDateId,
    maxDateId,
    disabledDateIds,
    firstDayOfWeek = "monday",
    showMonthNav = true,
    onVisibleMonthChange,
    viewMode,
    initialViewMode,
    onViewModeChange,
    className,
}: AppCalendarProps) {
    const isControlled = value !== undefined;
    const initialValueResolved = isControlled
        ? (value ?? null)
        : (initialValue ?? null);

    const [internalValue, setInternalValue] =
        useState<CalendarValue>(initialValueResolved);
    const currentValue = isControlled ? (value ?? null) : internalValue;

    const [phase, setPhase] = useState<RangePhase>(() =>
        rangePhaseFromValue(initialValueResolved),
    );
    const lastEmittedRef = useRef<CalendarValue>(initialValueResolved);

    const [visibleMonthId, setVisibleMonthId] = useState(() =>
        resolveInitialMonthId(
            initialValueResolved,
            initialMonthId,
            todayDateId(),
        ),
    );
    const [weekAnchorId, setWeekAnchorId] = useState(() =>
        startOfWeekId(
            anchorDateId(initialValueResolved, initialMonthId ?? todayDateId()),
            firstDayOfWeek,
        ),
    );

    const [internalView, setInternalView] = useState<AppCalendarViewMode>(
        () => initialViewMode ?? "month",
    );
    const resolvedView = viewMode ?? internalView;

    // 收起归位可能落在旧滚动窗口之外，换 key 重挂载周条以重新开窗
    const [stripResetCount, setStripResetCount] = useState(0);

    const [containerWidth, setContainerWidth] = useState(0);
    const gridWidth = Math.min(containerWidth, CALENDAR_METRICS.gridWidth);

    const [heightAnim] = useState(
        () =>
            new Animated.Value(
                (initialViewMode ?? "month") === "month"
                    ? computeMonthHeight(
                          resolveInitialMonthId(
                              initialValueResolved,
                              initialMonthId,
                              todayDateId(),
                          ),
                          firstDayOfWeek,
                      )
                    : STRIP_HEIGHT,
            ),
    );

    // 受控值外部变更时同步 range 阶段（回显本次上报值时保留内部阶段）
    useEffect(() => {
        if (!isControlled) {
            return;
        }
        const incoming = value ?? null;
        if (incoming === lastEmittedRef.current) {
            return;
        }
        lastEmittedRef.current = incoming;
        setPhase(rangePhaseFromValue(incoming));
    }, [isControlled, value]);

    const activeRanges = useMemo(
        () => toActiveDateRanges(mode, currentValue),
        [mode, currentValue],
    );

    const handleDayPress = useCallback(
        (dateId: string) => {
            let next: CalendarValue;
            if (mode === "single") {
                next = nextSingleValue(currentValue, dateId);
            } else {
                const result = nextRangeValue(currentValue, dateId, phase);
                next = result.value;
                setPhase(result.phase);
            }
            lastEmittedRef.current = next;
            if (!isControlled) {
                setInternalValue(next);
            }
            onChange?.(next);
        },
        [currentValue, isControlled, mode, onChange, phase],
    );

    const handleWeekChange = useCallback((weekStartId: string) => {
        setWeekAnchorId(weekStartId);
    }, []);

    const canPrev = !minDateId || visibleMonthId > toMonthId(minDateId);
    const canNext = !maxDateId || visibleMonthId < toMonthId(maxDateId);

    const shiftMonth = useCallback(
        (delta: number) => {
            const next = shiftMonthWithinBounds(
                visibleMonthId,
                delta,
                minDateId,
                maxDateId,
            );
            if (!next) {
                return;
            }
            setVisibleMonthId(next);
            onVisibleMonthChange?.(next);
        },
        [maxDateId, minDateId, onVisibleMonthChange, visibleMonthId],
    );

    const switchView = useCallback(
        (next: AppCalendarViewMode) => {
            if (next === resolvedView) {
                return;
            }
            if (viewMode === undefined) {
                setInternalView(next);
            }
            onViewModeChange?.(next);
            if (next === "month") {
                const targetMonth = expandMonthId(currentValue, weekAnchorId);
                setVisibleMonthId(targetMonth);
                onVisibleMonthChange?.(targetMonth);
            } else {
                setWeekAnchorId(
                    collapseWeekId(
                        currentValue,
                        visibleMonthId,
                        firstDayOfWeek,
                        todayDateId(),
                    ),
                );
                setStripResetCount((count) => count + 1);
            }
        },
        [
            currentValue,
            firstDayOfWeek,
            onVisibleMonthChange,
            onViewModeChange,
            resolvedView,
            viewMode,
            visibleMonthId,
            weekAnchorId,
        ],
    );

    const panResponder = useMemo(
        () =>
            PanResponder.create({
                onMoveShouldSetPanResponder: (_event, gesture) =>
                    Math.abs(gesture.dy) > SWIPE_THRESHOLD &&
                    Math.abs(gesture.dy) > Math.abs(gesture.dx),
                onPanResponderRelease: (_event, gesture) => {
                    if (gesture.dy > 0) {
                        switchView("month");
                    } else if (gesture.dy < 0) {
                        switchView("week");
                    }
                },
            }),
        [switchView],
    );

    const targetHeight =
        resolvedView === "month"
            ? computeMonthHeight(visibleMonthId, firstDayOfWeek)
            : STRIP_HEIGHT;
    useEffect(() => {
        Animated.timing(heightAnim, {
            duration: VIEW_ANIMATION_DURATION,
            toValue: targetHeight,
            useNativeDriver: false,
        }).start();
    }, [heightAnim, targetHeight]);

    const handleLayout: ViewType["props"]["onLayout"] = (event) => {
        setContainerWidth(event.nativeEvent.layout.width);
    };

    return (
        <View
            className={className}
            onLayout={handleLayout}
            {...panResponder.panHandlers}
        >
            <Animated.View
                style={{
                    height: heightAnim,
                    overflow: "hidden",
                    width: "100%",
                }}
            >
                {gridWidth > 0 && resolvedView === "week" ? (
                    <WeekStrip
                        activeRanges={activeRanges}
                        disabledDateIds={disabledDateIds}
                        firstDayOfWeek={firstDayOfWeek}
                        key={stripResetCount}
                        maxDateId={maxDateId}
                        minDateId={minDateId}
                        onDayPress={handleDayPress}
                        onWeekChange={handleWeekChange}
                        weekAnchorId={weekAnchorId}
                        width={gridWidth}
                    />
                ) : null}
                {gridWidth > 0 && resolvedView === "month" ? (
                    <View style={{ alignSelf: "center", width: gridWidth }}>
                        <View
                            style={{
                                alignItems: "center",
                                flexDirection: "row",
                                height: CALENDAR_METRICS.monthTitleRowHeight,
                                justifyContent: "space-between",
                            }}
                        >
                            <AppText numberOfLines={1} variant="control">
                                {formatMonthTitle(visibleMonthId)}
                            </AppText>
                            {showMonthNav ? (
                                <View style={{ flexDirection: "row", gap: 4 }}>
                                    <IconButton
                                        accessibilityLabel="上一月"
                                        disabled={!canPrev}
                                        icon={ChevronLeft}
                                        iconSize={20}
                                        onPress={() => shiftMonth(-1)}
                                        size="compact"
                                        variant="ghost"
                                    />
                                    <IconButton
                                        accessibilityLabel="下一月"
                                        disabled={!canNext}
                                        icon={ChevronRight}
                                        iconSize={20}
                                        onPress={() => shiftMonth(1)}
                                        size="compact"
                                        variant="ghost"
                                    />
                                </View>
                            ) : null}
                        </View>
                        <Calendar
                            calendarActiveDateRanges={activeRanges}
                            calendarColorScheme="light"
                            calendarDayHeight={CALENDAR_METRICS.dayCellSize}
                            calendarDisabledDateIds={disabledDateIds}
                            calendarFirstDayOfWeek={firstDayOfWeek}
                            calendarMaxDateId={maxDateId}
                            calendarMinDateId={minDateId}
                            calendarMonthHeaderHeight={0}
                            calendarMonthId={visibleMonthId}
                            calendarRowHorizontalSpacing={0}
                            calendarRowVerticalSpacing={
                                CALENDAR_METRICS.weekRowGap
                            }
                            calendarWeekHeaderHeight={
                                CALENDAR_METRICS.weekdayHeaderHeight
                            }
                            getCalendarDayFormat={formatCalendarDay}
                            getCalendarMonthFormat={formatCalendarMonth}
                            getCalendarWeekDayFormat={formatCalendarWeekDay}
                            onCalendarDayPress={handleDayPress}
                            theme={appCalendarTheme}
                        />
                    </View>
                ) : null}
            </Animated.View>
        </View>
    );
}

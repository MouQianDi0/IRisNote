import {
    addMonths,
    startOfWeekId,
    toMonthId,
    todayDateId,
} from "@/shared/utils/date-id";

/**
 * 日历纯逻辑：选值状态机、激活范围、锚定与边界钳制。
 * 语义契约见 docs/UI/日历公共组件规范.md §5.3；仅依赖 date-id 工具，可在 Node 中测试。
 */

export type CalendarSelectionMode = "single" | "range";

export type CalendarRange = { startDateId: string; endDateId: string };

export type CalendarValue = string | CalendarRange | null;

/** range 模式内部阶段：起点已选未定终点 / 范围已完成。 */
export type RangePhase = "idle" | "pending" | "done";

export function isCalendarRange(value: CalendarValue): value is CalendarRange {
    return typeof value === "object" && value !== null;
}

/** single：再次点击已选日不取消（§5.3），任何点击即成为选中值。 */
export function nextSingleValue(
    _current: CalendarValue,
    picked: string,
): string {
    return picked;
}

/**
 * range（§5.3）：
 * - 无起点或已完成：以点击日为新起点（临时终点=起点，pending）；
 * - pending 中点击晚于起点：补终点，完成；
 * - pending 中点击早于起点：起点重设为该日，继续 pending；
 * - pending 中点击同一天：完成单日范围。
 */
export function nextRangeValue(
    current: CalendarValue,
    picked: string,
    phase: RangePhase,
): { value: CalendarRange; phase: RangePhase } {
    if (phase === "pending" && isCalendarRange(current)) {
        const { startDateId } = current;
        if (picked > startDateId) {
            return {
                value: { startDateId, endDateId: picked },
                phase: "done",
            };
        }
        if (picked < startDateId) {
            return {
                value: { startDateId: picked, endDateId: picked },
                phase: "pending",
            };
        }
        return {
            value: { startDateId, endDateId: startDateId },
            phase: "done",
        };
    }
    return {
        value: { startDateId: picked, endDateId: picked },
        phase: "pending",
    };
}

/** 由外部传入值反推阶段：完整范围视为 done，单日/空视为 idle。 */
export function rangePhaseFromValue(value: CalendarValue): RangePhase {
    if (!isCalendarRange(value)) {
        return "idle";
    }
    return value.startDateId === value.endDateId ? "idle" : "done";
}

export type ActiveDateRange = { startId: string; endId: string };

/** 选中值 → flash-calendar 的 calendarActiveDateRanges。 */
export function toActiveDateRanges(
    mode: CalendarSelectionMode,
    value: CalendarValue,
): ActiveDateRange[] {
    if (mode === "single") {
        return typeof value === "string"
            ? [{ startId: value, endId: value }]
            : [];
    }
    if (isCalendarRange(value)) {
        return [{ startId: value.startDateId, endId: value.endDateId }];
    }
    return [];
}

/** 锚定日：有选中取选中（range 取起点），否则回退。 */
export function anchorDateId(value: CalendarValue, fallback: string): string {
    if (typeof value === "string") {
        return value;
    }
    if (isCalendarRange(value)) {
        return value.startDateId;
    }
    return fallback;
}

/** 初始显示月：value 所在月 → initialMonthId → 当月（§5.1 initialMonthId）。 */
export function resolveInitialMonthId(
    value: CalendarValue,
    initialMonthId: string | undefined,
    todayId: string,
): string {
    const anchored = anchorDateId(value, "");
    if (anchored) {
        return toMonthId(anchored);
    }
    return initialMonthId ?? toMonthId(todayId);
}

/**
 * 月份导航钳制：越界（整月早于 min 所在月 / 晚于 max 所在月）返回 null。
 */
export function shiftMonthWithinBounds(
    monthId: string,
    delta: number,
    minDateId?: string,
    maxDateId?: string,
): string | null {
    const next = addMonths(monthId, delta);
    if (minDateId && next < toMonthId(minDateId)) {
        return null;
    }
    if (maxDateId && next > toMonthId(maxDateId)) {
        return null;
    }
    return next;
}

/** 展开目标月：优先选中值所在月，否则当前周所在月。 */
export function expandMonthId(
    value: CalendarValue,
    weekAnchorId: string,
): string {
    const anchored = anchorDateId(value, "");
    return toMonthId(anchored || weekAnchorId);
}

/** 收起目标周：优先选中值所在周，否则当日在当前月则取当日，否则当前月首周。 */
export function collapseWeekId(
    value: CalendarValue,
    visibleMonthId: string,
    firstDayOfWeek: "monday" | "sunday",
    todayId: string,
): string {
    const anchored = anchorDateId(value, "");
    if (anchored) {
        return startOfWeekId(anchored, firstDayOfWeek);
    }
    if (toMonthId(todayId) === visibleMonthId) {
        return startOfWeekId(todayId, firstDayOfWeek);
    }
    return startOfWeekId(visibleMonthId, firstDayOfWeek);
}

/** 周条滚动窗口：以 anchor 为中心前后各 `radius` 周，受 min/max 钳制。 */
export function buildWeekWindow(
    anchorWeekId: string,
    radius: number,
    shiftWeek: (weekId: string, weeks: number) => string,
    minWeekId?: string,
    maxWeekId?: string,
): string[] {
    const weeks: string[] = [];
    for (let offset = -radius; offset <= radius; offset += 1) {
        const weekId = shiftWeek(anchorWeekId, offset);
        if (minWeekId && weekId < minWeekId) {
            continue;
        }
        if (maxWeekId && weekId > maxWeekId) {
            continue;
        }
        weeks.push(weekId);
    }
    return weeks;
}

export { todayDateId };

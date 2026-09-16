/**
 * Date ID 工具：组件内外一律使用 "YYYY-MM-DD" 本地时区字符串。
 *
 * 禁止 `new Date(id).toISOString().slice(0, 10)` 式转换（UTC 偏移会错一天），
 * 详见 docs/UI/日历公共组件规范.md §2。
 */

const pad2 = (value: number): string => String(value).padStart(2, "0");

/** 本地时区 Date → "YYYY-MM-DD"。 */
export function toDateId(date: Date): string {
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** "YYYY-MM-DD" → 本地时区当日零点 Date。 */
export function fromDateId(id: string): Date {
    const [year, month, day] = id.split("-").map(Number);
    return new Date(year, month - 1, day);
}

export function todayDateId(): string {
    return toDateId(new Date());
}

/** 同格式字符串字典序即时间序；返回 -1/0/1。 */
export function compareDateId(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0;
}

/** 从 Date ID 起偏移天数（可为负），全程本地时区。 */
export function addDays(id: string, days: number): string {
    const date = fromDateId(id);
    date.setDate(date.getDate() + days);
    return toDateId(date);
}

/** 从 Date ID 起偏移周数（可为负）。 */
export function addWeeks(id: string, weeks: number): string {
    return addDays(id, weeks * 7);
}

/** 该 Date ID 所在月的月份 ID（当月 1 日）。 */
export function toMonthId(id: string): string {
    return `${id.slice(0, 7)}-01`;
}

/** 月份 ID 偏移月数（可为负），结果恒为 1 日。 */
export function addMonths(monthId: string, months: number): string {
    const date = fromDateId(monthId);
    date.setDate(1);
    date.setMonth(date.getMonth() + months);
    return toDateId(date);
}

export function isDateInMonth(id: string, monthId: string): boolean {
    return id.slice(0, 7) === monthId.slice(0, 7);
}

/** 按周起点取该 Date ID 所在周的首日。 */
export function startOfWeekId(
    id: string,
    firstDayOfWeek: "monday" | "sunday",
): string {
    const day = fromDateId(id).getDay();
    const diff =
        firstDayOfWeek === "monday" ? (day === 0 ? -6 : 1 - day) : -day;
    return addDays(id, diff);
}

const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"] as const;

/** "2026年9月" 样式月份标题。 */
export function formatMonthTitle(monthId: string): string {
    const date = fromDateId(monthId);
    return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

/** 按周起点排列的星期列表头文案。 */
export function weekdayLabels(
    firstDayOfWeek: "monday" | "sunday",
): string[] {
    const order =
        firstDayOfWeek === "monday" ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6];
    return order.map((day) => WEEKDAY_LABELS[day]);
}

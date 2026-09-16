import { defaultThemePreset, radii, semanticColors } from "@/shared/theme";

import type { CalendarTheme } from "@marceloterreiro/flash-calendar";

/**
 * 日历视觉规格 → flash-calendar CalendarTheme 映射（路线 B）。
 * 选中/今日为整格 48×48 矩形圆角（radii.control 连续圆角），
 * 范围中段全宽色带、端点仅外侧圆角；状态表见 docs/UI/日历公共组件规范.md §4.3。
 */

export const CALENDAR_METRICS = {
    /** 网格宽（7×48），在容器内水平居中 */
    gridWidth: 336,
    dayCellSize: 48,
    /** 周行间距 */
    weekRowGap: 4,
    weekdayHeaderHeight: 32,
    monthTitleRowHeight: 44,
    dividerWidth: 1,
    dayFontSize: 17,
    weekdayFontSize: 13,
} as const;

const pressedOpacity = defaultThemePreset.motion.pressedOpacity;
const cornerRadius = radii.control;

/** 模块级格式化函数：引用稳定，满足 flash-calendar 相等性检查要求。 */
export const formatCalendarDay = (date: Date): string =>
    String(date.getDate());
export const formatCalendarMonth = (date: Date): string =>
    `${date.getFullYear()}年${date.getMonth() + 1}月`;
const WEEKDAY_NARROW = ["日", "一", "二", "三", "四", "五", "六"] as const;
export const formatCalendarWeekDay = (date: Date): string =>
    WEEKDAY_NARROW[date.getDay()];

export const appCalendarTheme: CalendarTheme = {
    rowWeek: {
        container: {
            // 库默认 8 会让表头列与 48dp 日期格错位，归零对齐
            gap: 0,
            // VStack 统一 4dp 间距补偿：分隔线到首行日期 0dp（§3）
            marginBottom: -CALENDAR_METRICS.weekRowGap,
            borderBottomWidth: CALENDAR_METRICS.dividerWidth,
            borderBottomColor: semanticColors.divider,
        },
    },
    itemWeekName: {
        content: {
            fontSize: CALENDAR_METRICS.weekdayFontSize,
            color: semanticColors.textSecondary,
        },
    },
    itemDayContainer: {
        // daySpacing=0 时 filler 仅覆盖 1px 接缝，颜色须与色带一致
        activeDayFiller: { backgroundColor: semanticColors.brandPrimary },
    },
    itemDay: {
        base: () => ({
            container: { borderCurve: "continuous" },
            content: { fontSize: CALENDAR_METRICS.dayFontSize },
        }),
        idle: ({ isPressed }) => ({
            container: {
                backgroundColor: "transparent",
                opacity: isPressed ? pressedOpacity : 1,
            },
            content: { color: semanticColors.textPrimary },
        }),
        today: ({ isPressed }) => ({
            container: {
                backgroundColor: semanticColors.surfaceSelected,
                borderTopLeftRadius: cornerRadius,
                borderTopRightRadius: cornerRadius,
                borderBottomLeftRadius: cornerRadius,
                borderBottomRightRadius: cornerRadius,
                borderWidth: 0,
                opacity: isPressed ? pressedOpacity : 1,
            },
            content: { color: semanticColors.brandPrimary },
        }),
        active: ({ isPressed, isStartOfRange, isEndOfRange }) => ({
            container: {
                backgroundColor: semanticColors.brandPrimary,
                borderTopLeftRadius: isStartOfRange ? cornerRadius : 0,
                borderBottomLeftRadius: isStartOfRange ? cornerRadius : 0,
                borderTopRightRadius: isEndOfRange ? cornerRadius : 0,
                borderBottomRightRadius: isEndOfRange ? cornerRadius : 0,
                opacity: isPressed ? pressedOpacity : 1,
            },
            content: { color: semanticColors.onBrandPrimary },
        }),
        disabled: () => ({
            container: { backgroundColor: "transparent", borderWidth: 0 },
            content: { color: semanticColors.textDisabled },
        }),
    },
};

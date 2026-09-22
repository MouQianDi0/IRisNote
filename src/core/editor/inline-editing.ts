export const INLINE_EDIT_DOUBLE_PRESS_MS = 300;

export type InlineEditField = "title" | "content";
export type InlineEditPress = { field: InlineEditField; at: number };

/** 第一次点击只定位光标；同一输入区间隔不超过 300ms 的第二次点击请求软键盘。 */
export function resolveInlineEditPress(
    previous: InlineEditPress | null,
    field: InlineEditField,
    at: number,
) {
    const openKeyboard =
        previous !== null &&
        previous.field === field &&
        at >= previous.at &&
        at - previous.at <= INLINE_EDIT_DOUBLE_PRESS_MS;
    return {
        openKeyboard,
        next: openKeyboard ? null : { field, at },
    } satisfies { openKeyboard: boolean; next: InlineEditPress | null };
}

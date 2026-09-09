export const EDIT_PRESS_INTERVAL_MS = 400;
export const FOCUS_TIMEOUT_MS = 1500;

export type ToolbarScrollState = {
    offset: number;
    direction: number;
    distance: number;
    visible: boolean;
};

export function resetToolbarScroll(offset = 0): ToolbarScrollState {
    return { offset, direction: 0, distance: 0, visible: true };
}

/** 正文 offset 增大对应手指上滑；反向后重新累计，忽略顶部回弹。 */
export function advanceToolbarScroll(state: ToolbarScrollState, rawOffset: number, pinned: boolean): ToolbarScrollState {
    const offset = Math.max(0, rawOffset);
    if (pinned) return resetToolbarScroll(offset);
    const delta = offset - state.offset;
    if (delta === 0) return state;
    const direction = Math.sign(delta);
    const distance = (direction === state.direction ? state.distance : 0) + Math.abs(delta);
    const visible = direction > 0 && distance >= 24 ? false
        : direction < 0 && distance >= 100 ? true : state.visible;
    return { offset, direction, distance, visible };
}

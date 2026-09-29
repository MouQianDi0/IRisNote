/** 关于页连点版本号开启开发者模式：点满次数即开启，两次点击间隔过长重新计数。 */
export const DEVELOPER_UNLOCK_TAPS = 7;
export const DEVELOPER_UNLOCK_TAP_GAP_MS = 1500;
/** 剩余次数不超过该值时才提示，避免误触时打扰。 */
export const DEVELOPER_UNLOCK_HINT_FROM = 3;

export type DeveloperUnlockCounter = {
    count: number;
    lastTapAt: number;
};

export type DeveloperUnlockResult = {
    counter: DeveloperUnlockCounter;
    /** 本次点击后还差的次数；0 表示本次完成解锁。 */
    remaining: number;
    unlocked: boolean;
};

export const initialDeveloperUnlockCounter: DeveloperUnlockCounter = {
    count: 0,
    lastTapAt: 0,
};

export function tapDeveloperUnlock(
    counter: DeveloperUnlockCounter,
    now: number,
): DeveloperUnlockResult {
    const continued =
        counter.count > 0 &&
        now - counter.lastTapAt <= DEVELOPER_UNLOCK_TAP_GAP_MS;
    const count = (continued ? counter.count : 0) + 1;
    if (count >= DEVELOPER_UNLOCK_TAPS)
        return {
            counter: initialDeveloperUnlockCounter,
            remaining: 0,
            unlocked: true,
        };
    return {
        counter: { count, lastTapAt: now },
        remaining: DEVELOPER_UNLOCK_TAPS - count,
        unlocked: false,
    };
}

export function developerUnlockHint(remaining: number): string | null {
    if (remaining <= 0 || remaining > DEVELOPER_UNLOCK_HINT_FROM) return null;
    return `再点 ${remaining} 次即可开启开发者模式`;
}

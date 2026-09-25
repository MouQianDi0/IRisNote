/** 页面获得焦点时窗口已有焦点，稍等界面稳定即可检测。 */
export const PAGE_FOCUS_DELAY_MS = 300;
/** iOS 没有窗口焦点限制，回到前台后稍等再检测。 */
export const RESUME_DELAY_MS = 300;
/** Android 窗口拿到焦点后即可读取剪贴板，只留合并连续事件的余量。 */
export const WINDOW_FOCUS_DELAY_MS = 100;
/** Android 回到前台后迟迟没有焦点事件时的保底检测。 */
export const WINDOW_FOCUS_FALLBACK_MS = 1000;
export const CLIPBOARD_CHANGE_DELAY_MS = 100;

type AppStateStatus =
    "active" | "background" | "inactive" | "unknown" | "extension";

/**
 * 决定摘录页「什么时候检测」的纯状态机；实际检测由 schedule 防抖执行。
 *
 * Android 10+ 只有拥有窗口焦点的应用才能访问剪贴板，剪贴板变化也只通知有焦点的应用：
 * - 从后台回来：AppState 的 active 早于窗口获得焦点，要等 focus 事件再检测；
 * - 分屏、小窗、通知栏等其他窗口抢走焦点（应用仍在前台）：焦点回来时检测；
 * - 应用内弹窗抢走焦点：关闭后主窗口重新获得焦点，不再读取剪贴板。
 */
export function createDetectionTrigger({
    platform,
    initialAppState,
    schedule,
    cancel,
}: {
    platform: "android" | "ios" | "other";
    initialAppState: AppStateStatus;
    schedule: (delayMs: number) => void;
    cancel: () => void;
}) {
    let appState = initialAppState;
    let awaitingWindowFocus = false;
    return {
        pageFocused() {
            schedule(PAGE_FOCUS_DELAY_MS);
        },
        appStateChanged(next: AppStateStatus) {
            const returning = appState !== "active" && next === "active";
            appState = next;
            if (next !== "active") {
                awaitingWindowFocus = false;
                cancel();
                return;
            }
            if (!returning) return;
            if (platform === "android") {
                awaitingWindowFocus = true;
                schedule(WINDOW_FOCUS_FALLBACK_MS);
            } else {
                schedule(RESUME_DELAY_MS);
            }
        },
        /** inAppModalOpen：失焦时是否有应用内弹窗（AppModal）打开。 */
        windowBlurred(inAppModalOpen: boolean) {
            if (appState === "active" && !inAppModalOpen)
                awaitingWindowFocus = true;
        },
        windowFocused() {
            if (!awaitingWindowFocus) return;
            awaitingWindowFocus = false;
            schedule(WINDOW_FOCUS_DELAY_MS);
        },
        /** 停留在前台且拥有焦点时复制（如页面内长按复制）。 */
        clipboardChanged() {
            if (appState === "active") schedule(CLIPBOARD_CHANGE_DELAY_MS);
        },
    };
}

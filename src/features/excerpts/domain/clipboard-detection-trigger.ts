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
 * Android 10+ 只有拥有窗口焦点的应用才能访问剪贴板，而 AppState 的 active
 * 早于窗口获得焦点，因此从后台回来要等 focus 事件再检测。弹窗关闭也会让主窗口
 * 重新获得焦点，但没进过后台，不应再次读取剪贴板。
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
        windowFocused() {
            if (!awaitingWindowFocus) return;
            awaitingWindowFocus = false;
            schedule(WINDOW_FOCUS_DELAY_MS);
        },
        /** 停留在前台时复制（分屏、小窗、通知栏、页面内长按复制）。 */
        clipboardChanged() {
            if (appState === "active") schedule(CLIPBOARD_CHANGE_DELAY_MS);
        },
    };
}

/** Android 键盘高度已扣除系统导航栏；容器底部差值使用同一个窗口坐标系。 */
export function remainingKeyboardOverlap(keyboardHeight: number, restingBottom: number,
    currentBottom: number, containerHeight: number): number {
    return Math.max(0, Math.min(containerHeight,
        keyboardHeight - (restingBottom - currentBottom)));
}

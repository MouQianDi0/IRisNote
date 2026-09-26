import { useCallback, useEffect, useRef, useState } from "react";
import {
    Dimensions,
    Keyboard,
    Platform,
    StatusBar,
    type KeyboardEvent,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { remainingKeyboardOverlap } from "./keyboard-layout";

/**
 * 键盘避让的共享实测机制：外层稳定容器不做避让、供 measureInWindow 实测底边，
 * 内层绝对定位容器按 keyboardOverlap 内缩，只补偿剩余重叠量。
 * 事件载荷在 edge-to-edge 下的偏差（如高度已扣导航栏）由实测闭环吸收。
 */
export function useKeyboardOverlap() {
    const [keyboardOverlap, setKeyboardOverlap] = useState(0);
    const keyboardOpen = useRef(Keyboard.isVisible());
    const keyboardTop = useRef<number | null>(
        Keyboard.metrics?.()?.screenY ?? null,
    );
    const keyboardHeight = useRef(Keyboard.metrics?.()?.height ?? 0);
    const restingBottom = useRef<number | null>(null);
    const insets = useSafeAreaInsets();
    const bottomInset = useRef(insets.bottom);
    const layoutFrame = useRef<number | null>(null);
    const measurement = useRef(0);
    const alive = useRef(true);
    const stableContainer = useRef<View | null>(null);

    // 测量不参与避让的外层，避免自身布局变化造成累计偏移；窗口已缩小时重叠自然为 0。
    const measureKeyboardOverlap = useCallback(() => {
        const request = ++measurement.current;
        stableContainer.current?.measureInWindow((_x, y, _width, height) => {
            if (!alive.current || request !== measurement.current) return;
            const top = keyboardTop.current;
            const bottom = y + height;
            if (!keyboardOpen.current) {
                restingBottom.current = bottom;
                setKeyboardOverlap(0);
                return;
            }
            if (Platform.OS === "android" && keyboardHeight.current > 0) {
                // 首次进入时键盘可能已打开。全面屏的窗口测量原点扣除了状态栏。
                const baseline =
                    restingBottom.current ??
                    Dimensions.get("screen").height -
                        (StatusBar.currentHeight ?? 0) -
                        bottomInset.current;
                setKeyboardOverlap(
                    remainingKeyboardOverlap(
                        keyboardHeight.current,
                        baseline,
                        bottom,
                        height,
                    ),
                );
            } else {
                setKeyboardOverlap(
                    top === null
                        ? 0
                        : Math.max(0, Math.min(height, bottom - top)),
                );
            }
        });
    }, []);

    const scheduleKeyboardMeasurement = useCallback(() => {
        measureKeyboardOverlap();
        if (layoutFrame.current !== null)
            cancelAnimationFrame(layoutFrame.current);
        layoutFrame.current = requestAnimationFrame(() => {
            layoutFrame.current = null;
            measureKeyboardOverlap();
        });
    }, [measureKeyboardOverlap]);

    useEffect(() => {
        alive.current = true;
        const dimensions = Dimensions.addEventListener(
            "change",
            scheduleKeyboardMeasurement,
        );
        return () => {
            alive.current = false;
            dimensions.remove();
            if (layoutFrame.current !== null)
                cancelAnimationFrame(layoutFrame.current);
        };
    }, [scheduleKeyboardMeasurement]);

    useEffect(() => {
        bottomInset.current = insets.bottom;
        scheduleKeyboardMeasurement();
    }, [insets.bottom, scheduleKeyboardMeasurement]);

    /** 由页面的 keyboardDidShow/Hide 监听转发事件；页面自身的 keyboardVisible 状态由页面维护。 */
    const handleKeyboardEvent = useCallback(
        (visible: boolean, event?: KeyboardEvent) => {
            keyboardOpen.current = visible;
            keyboardTop.current = visible
                ? (event?.endCoordinates.screenY ??
                  Keyboard.metrics?.()?.screenY ??
                  null)
                : null;
            keyboardHeight.current = visible
                ? (event?.endCoordinates.height ??
                  Keyboard.metrics?.()?.height ??
                  0)
                : 0;
            scheduleKeyboardMeasurement();
        },
        [scheduleKeyboardMeasurement],
    );

    return {
        keyboardOverlap,
        stableContainer,
        onStableLayout: scheduleKeyboardMeasurement,
        handleKeyboardEvent,
    };
}

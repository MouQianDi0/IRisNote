import { useRef } from "react";
import { PanResponder } from "react-native";

/**
 * 滑动选择 hook — 在列表上垂直滑动切换选中项
 * 可复用于任意有序列表（分类、Tab、菜单等）
 *
 * @param items     有序的选项 ID 数组
 * @param selectedId 当前选中的 ID
 * @param onChange   选中项变化时的回调
 * @returns panHandlers — 展开到目标 View 上
 */
export function useSwipeSelect<T>(
    items: T[],
    selectedId: T,
    onChange: (id: T) => void,
) {
    const selectedRef = useRef(selectedId);
    selectedRef.current = selectedId;

    const panResponder = PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
            return (
                Math.abs(gesture.dy) > 20 &&
                Math.abs(gesture.dy) > Math.abs(gesture.dx)
            );
        },
        onPanResponderRelease: (_, gesture) => {
            if (Math.abs(gesture.dy) < 30) return;

            const currentIndex = items.indexOf(selectedRef.current);

            const total = items.length;
            let nextIndex: number;

            if (gesture.dy < -30) {
                // 向上滑 → 下一个
                nextIndex = (currentIndex + 1 + total) % total;
            } else {
                // 向下滑 → 上一个
                nextIndex = (currentIndex - 1 + total) % total; //
            }

            onChange(items[nextIndex]);
        },
    });

    return panResponder.panHandlers;
}

import { type Href, useRouter } from "expo-router";
import { useRef } from "react";
import { PanResponder } from "react-native";
import {
    getActiveTabKey,
    TAB_INDEX_BY_KEY,
    TAB_ORDER,
} from "../navigation.constants";

export function useSwipeTab(pathname: string) {
    const router = useRouter();
    const pathRef = useRef(pathname);
    pathRef.current = pathname;

    const panResponder = PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
            return (
                Math.abs(gesture.dy) > 20 &&
                Math.abs(gesture.dy) > Math.abs(gesture.dx)
            );
        },
        onPanResponderRelease: (_, gesture) => {
            if (Math.abs(gesture.dy) < 30) return;

            const currentIndex = TAB_INDEX_BY_KEY[getActiveTabKey(pathRef.current)];
            const total = TAB_ORDER.length;

            if (gesture.dy < -30) {
                const prevIndex = (currentIndex - 1 + total) % total;
                router.replace(TAB_ORDER[prevIndex] as Href);
            } else if (gesture.dy > 30) {
                const nextIndex = (currentIndex + 1) % total;
                router.replace(TAB_ORDER[nextIndex] as Href);
            }
        },
    });

    return panResponder.panHandlers;
}

import { type Href, useRouter } from "expo-router";
import { useRef } from "react";
import { PanResponder } from "react-native";

type TabKey = "note" | "todo" | "excerpt" | "user";

const tabPaths = [
    "/(tabs)/user",
    "/(tabs)/excerpt",
    "/(tabs)/todo",
    "/(tabs)/note",
] as const;

const pathToIndex: Record<TabKey, number> = {
    user: 0,
    excerpt: 1,
    todo: 2,
    note: 3,
};

const getActiveTabKey = (path: string): TabKey => {
    if (
        path === "/" ||
        path === "/note" ||
        path.startsWith("/note/") ||
        path === "/(tabs)/note" ||
        path.startsWith("/(tabs)/note/")
    ) {
        return "note";
    }
    if (
        path === "/todo" ||
        path.startsWith("/todo/") ||
        path === "/(tabs)/todo" ||
        path.startsWith("/(tabs)/todo/")
    ) {
        return "todo";
    }
    if (
        path === "/excerpt" ||
        path.startsWith("/excerpt/") ||
        path === "/(tabs)/excerpt" ||
        path.startsWith("/(tabs)/excerpt/")
    ) {
        return "excerpt";
    }
    if (
        path === "/user" ||
        path.startsWith("/user/") ||
        path === "/(tabs)/user" ||
        path.startsWith("/(tabs)/user/")
    ) {
        return "user";
    }
    return "note";
};

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

            const currentIndex = pathToIndex[getActiveTabKey(pathRef.current)];
            const total = tabPaths.length;

            if (gesture.dy < -30) {
                const prevIndex = (currentIndex - 1 + total) % total;
                router.push(tabPaths[prevIndex] as Href);
            } else if (gesture.dy > 30) {
                const nextIndex = (currentIndex + 1) % total;
                router.push(tabPaths[nextIndex] as Href);
            }
        },
    });

    return panResponder.panHandlers;
}

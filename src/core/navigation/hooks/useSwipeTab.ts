import { type Href, useRouter } from "expo-router";
import { PanResponder } from "react-native";
import {
    getActiveTabKey,
    TAB_MENU_ITEMS,
} from "../navigation.constants";

export function useSwipeTab(pathname: string) {
    const router = useRouter();

    const panResponder = PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
            return (
                Math.abs(gesture.dx) > 20 &&
                Math.abs(gesture.dx) > Math.abs(gesture.dy)
            );
        },
        onPanResponderRelease: (_, gesture) => {
            if (
                Math.abs(gesture.dx) <= 30 ||
                Math.abs(gesture.dx) <= Math.abs(gesture.dy)
            ) {
                return;
            }

            const currentIndex = TAB_MENU_ITEMS.findIndex(
                (item) => item.key === getActiveTabKey(pathname),
            );
            const total = TAB_MENU_ITEMS.length;

            const direction = gesture.dx < 0 ? 1 : -1;
            const nextIndex = (currentIndex + direction + total) % total;
            router.replace(TAB_MENU_ITEMS[nextIndex].route as Href);
        },
    });

    return panResponder.panHandlers;
}

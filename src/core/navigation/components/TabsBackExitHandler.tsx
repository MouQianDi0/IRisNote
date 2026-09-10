import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { BackHandler } from "react-native";
import { banner } from "@/core/notifications";

export default function TabsBackExitHandler() {
    const lastBackPressRef = useRef(-Infinity);

    useFocusEffect(
        useCallback(() => {
            let timer: ReturnType<typeof setTimeout> | undefined;
            const subscription = BackHandler.addEventListener(
                "hardwareBackPress",
                () => {
                    const now = Date.now();

                    if (now - lastBackPressRef.current <= 1500) {
                        banner.dismiss("back-exit");
                        BackHandler.exitApp();
                        return true;
                    }

                    lastBackPressRef.current = now;
                    banner.dismiss("back-exit");
                    banner.show({ id: "back-exit", type: "neutral", title: "再按一次返回退出应用",
                        lifetime: { mode: "timed", durationMs: 1500 }, queueTtlMs: 1500 });
                    clearTimeout(timer);
                    timer = setTimeout(() => { banner.dismiss("back-exit"); lastBackPressRef.current = -Infinity; }, 1500);
                    return true;
                },
            );

            return () => { subscription.remove(); clearTimeout(timer); banner.dismiss("back-exit"); lastBackPressRef.current = -Infinity; };
        }, []),
    );

    return null;
}

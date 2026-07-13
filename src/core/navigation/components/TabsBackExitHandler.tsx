import { useFocusEffect } from "expo-router";
import { useCallback, useRef } from "react";
import { BackHandler, ToastAndroid } from "react-native";

export default function TabsBackExitHandler() {
    const lastBackPressRef = useRef(0);

    useFocusEffect(
        useCallback(() => {
            const subscription = BackHandler.addEventListener(
                "hardwareBackPress",
                () => {
                    const now = Date.now();

                    if (now - lastBackPressRef.current <= 1500) {
                        BackHandler.exitApp();
                        return true;
                    }

                    lastBackPressRef.current = now;
                    ToastAndroid.show("再次返回退出应用", ToastAndroid.SHORT);
                    return true;
                },
            );

            return () => subscription.remove();
        }, []),
    );

    return null;
}

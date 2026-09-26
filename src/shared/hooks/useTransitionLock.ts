import { useNavigation, type NativeStackNavigationProp } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { BackHandler } from "react-native";

/**
 * Blocks back actions while the current screen's enter transition is running.
 * Calling back mid-transition can leave the native stack on a blank screen.
 */

const DEFAULT_FALLBACK_MS = 600;

type StackNavigation = NativeStackNavigationProp<
    Record<string, object | undefined>
>;

export function useTransitionLock(fallbackMs = DEFAULT_FALLBACK_MS) {
    const navigation = useNavigation<StackNavigation>();
    const lockedRef = useRef(true);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const unlock = useCallback(() => {
        lockedRef.current = false;
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const lockFor = useCallback(
        (ms: number) => {
            lockedRef.current = true;
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(unlock, ms);
        },
        [unlock],
    );

    useEffect(() => {
        // Fallback: screens outside a native stack never emit transitionEnd.
        lockFor(fallbackMs);
        const unsubscribe = navigation.addListener("transitionEnd", (event) => {
            if (!event.data.closing) unlock();
        });

        return () => {
            unsubscribe();
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [navigation, fallbackMs, lockFor, unlock]);

    useEffect(() => {
        // Returning true swallows Android hardware back while locked.
        const subscription = BackHandler.addEventListener(
            "hardwareBackPress",
            () => lockedRef.current,
        );
        return () => subscription.remove();
    }, []);

    /** Wraps a back handler: ignored while locked, and re-locks after firing to stop double back. */
    return useCallback(
        <Args extends unknown[]>(action: (...args: Args) => void) =>
            (...args: Args) => {
                if (lockedRef.current) return;
                lockFor(fallbackMs);
                action(...args);
            },
        [fallbackMs, lockFor],
    );
}

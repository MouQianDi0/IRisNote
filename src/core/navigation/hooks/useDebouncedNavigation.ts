import { type Href, usePathname, useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

/** Serializes rapid navigation requests for app-shell controls. */

const getRouteKey = (route: Href) => {
    if (typeof route === "string") {
        return route;
    }

    const params = route.params ? JSON.stringify(route.params) : "";
    return `${route.pathname}?${params}`;
};

/**
 * 防抖导航 hook — 快速连点时只接受第一次点击，跳转期间加锁防止重复入栈
 * @returns onNavigate — 调用它来触发防抖导航
 */
export function useDebouncedNavigation() {
    const router = useRouter();
    const pathname = usePathname();
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lockRef = useRef(false);
    const pendingRouteKeyRef = useRef<string | null>(null);

    useEffect(() => {
        return () => {
            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }
            if (unlockTimer.current) {
                clearTimeout(unlockTimer.current);
            }
        };
    }, []);

    const onNavigate = useCallback(
        (route: Href) => {
            const routeKey = getRouteKey(route);

            if (lockRef.current || pendingRouteKeyRef.current === routeKey) {
                return;
            }

            lockRef.current = true;
            pendingRouteKeyRef.current = routeKey;

            if (debounceTimer.current) {
                clearTimeout(debounceTimer.current);
            }

            debounceTimer.current = setTimeout(() => {
                debounceTimer.current = null;

                const targetPathname =
                    typeof route === "string" ? route : route.pathname;
                if (pathname === targetPathname) {
                    lockRef.current = false;
                    pendingRouteKeyRef.current = null;
                    return;
                }

                router.push(route);

                unlockTimer.current = setTimeout(() => {
                    lockRef.current = false;
                    pendingRouteKeyRef.current = null;
                    unlockTimer.current = null;
                }, 500);
            }, 100);
        },
        [pathname, router],
    );

    return onNavigate;
}

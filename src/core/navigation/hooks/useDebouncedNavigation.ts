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
 * 首次点击立即导航，跳转期间加锁防止快速连点重复入栈。
 * @returns onNavigate — 调用它来触发防抖导航
 */
export function useDebouncedNavigation() {
    const router = useRouter();
    const pathname = usePathname();
    const unlockTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lockRef = useRef(false);
    const pendingRouteKeyRef = useRef<string | null>(null);

    useEffect(() => {
        return () => {
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

            const targetPathname =
                typeof route === "string" ? route : route.pathname;
            if (pathname === targetPathname) return;

            lockRef.current = true;
            pendingRouteKeyRef.current = routeKey;
            try {
                router.push(route);
            } catch (error) {
                lockRef.current = false;
                pendingRouteKeyRef.current = null;
                throw error;
            }

            unlockTimer.current = setTimeout(() => {
                lockRef.current = false;
                pendingRouteKeyRef.current = null;
                unlockTimer.current = null;
            }, 500);
        },
        [pathname, router],
    );

    return onNavigate;
}

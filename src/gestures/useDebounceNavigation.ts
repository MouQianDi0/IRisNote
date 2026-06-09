import { type Href, usePathname, useRouter } from "expo-router";
import { useRef } from "react";

/**
 * 防抖导航 hook — 快速连点时只跳转最后一次，跳转后加锁防止重复跳转
 * @returns onNavigate — 调用它来触发防抖导航
 */
export function useDebounceNavigation() {
    const router = useRouter();
    const pathname = usePathname();
    const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lockRef = useRef(false);

    const onNavigate = (route: Href) => {
        if (lockRef.current) return;
        if (debounceTimer.current) {
            clearTimeout(debounceTimer.current);
        }
        debounceTimer.current = setTimeout(() => {
            debounceTimer.current = null;
            if (pathname === route) return;
            lockRef.current = true;
            router.push(route);
            setTimeout(() => {
                lockRef.current = false;
            }, 300);
        }, 100);
    };

    return onNavigate;
}

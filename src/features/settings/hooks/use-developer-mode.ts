import { useApplicationDatabase } from "@/core/database";
import { router, type Href } from "expo-router";
import { useEffect } from "react";
import {
    loadDeveloperMode,
    useDeveloperModeStore,
} from "../state/developer-mode-store";

const settingsRoute = "/pages/user/settings" as Href;

/** 读取设备级开发者模式开关；设置页、关于页据此显示入口或解锁提示。 */
export function useDeveloperMode() {
    const database = useApplicationDatabase();
    const ready = useDeveloperModeStore((state) => state.ready);
    const enabled = useDeveloperModeStore((state) => state.enabled);
    useEffect(() => {
        void loadDeveloperMode(database);
    }, [database]);
    return { database, ready, enabled };
}

/** 开发者页面守卫：未开启时（含直接访问路由）退回设置页。 */
export function useDeveloperModeGuard() {
    const mode = useDeveloperMode();
    useEffect(() => {
        if (!mode.ready || mode.enabled) return;
        if (router.canGoBack()) router.back();
        else router.replace(settingsRoute);
    }, [mode.ready, mode.enabled]);
    return mode;
}

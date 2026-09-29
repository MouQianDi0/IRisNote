import { create } from "zustand";
import type { ApplicationDatabase } from "@/core/database/database.types";
import { SystemPreferencesRepository } from "../data/system-preferences.repository";

type DeveloperModeState = {
    ready: boolean;
    enabled: boolean;
};

/** 关于页（解锁）、设置页（入口）与开发者选项页共用同一份开关状态。 */
export const useDeveloperModeStore = create<DeveloperModeState>(() => ({
    ready: false,
    enabled: false,
}));

let loaded: { database: ApplicationDatabase; pending: Promise<void> } | null =
    null;

export function loadDeveloperMode(
    database: ApplicationDatabase,
): Promise<void> {
    if (loaded?.database === database) return loaded.pending;
    const pending = new SystemPreferencesRepository(database)
        .developerModeEnabled()
        .then(
            (enabled) => {
                if (loaded?.pending !== pending) return;
                useDeveloperModeStore.setState({ ready: true, enabled });
            },
            () => {
                // 读取失败按关闭处理，下次进入页面重试。
                if (loaded?.pending === pending) loaded = null;
                useDeveloperModeStore.setState({ ready: true });
            },
        );
    loaded = { database, pending };
    return pending;
}

/** 先写库再更新状态：写入失败时入口保持原样，由调用方提示。 */
export async function setDeveloperMode(
    database: ApplicationDatabase,
    enabled: boolean,
) {
    await new SystemPreferencesRepository(database).setDeveloperModeEnabled(
        enabled,
    );
    useDeveloperModeStore.setState({ ready: true, enabled });
}

import { create } from "zustand";
import type { ApplicationDatabase } from "@/core/database/database.types";
import { SystemPreferencesRepository } from "@/features/settings/data/system-preferences.repository";

type ClipboardPreferences = {
    ready: boolean;
    pending: boolean;
    autoDetectEnabled: boolean;
    hintDismissed: boolean;
};

/** 摘录页与设置页共用同一份开关状态，任一处修改另一处立即可见。 */
export const useClipboardPreferencesStore = create<ClipboardPreferences>(
    () => ({
        ready: false,
        pending: false,
        autoDetectEnabled: false,
        hintDismissed: false,
    }),
);

let loaded: { database: ApplicationDatabase; pending: Promise<void> } | null =
    null;

export function loadClipboardPreferences(
    database: ApplicationDatabase,
): Promise<void> {
    if (loaded?.database === database) return loaded.pending;
    const repository = new SystemPreferencesRepository(database);
    const pending = Promise.all([
        repository.clipboardAutoDetectEnabled(),
        repository.clipboardHintDismissed(),
    ]).then(
        ([autoDetectEnabled, hintDismissed]) => {
            if (loaded?.pending !== pending) return;
            useClipboardPreferencesStore.setState({
                ready: true,
                autoDetectEnabled,
                hintDismissed,
            });
        },
        (cause: unknown) => {
            // 读取失败按默认关闭处理，下次进入页面重试。
            if (loaded?.pending === pending) loaded = null;
            useClipboardPreferencesStore.setState({ ready: true });
            throw cause;
        },
    );
    loaded = { database, pending };
    return pending;
}

export async function setClipboardAutoDetect(
    database: ApplicationDatabase,
    enabled: boolean,
) {
    useClipboardPreferencesStore.setState({ pending: true });
    try {
        await new SystemPreferencesRepository(
            database,
        ).setClipboardAutoDetectEnabled(enabled);
        useClipboardPreferencesStore.setState({ autoDetectEnabled: enabled });
    } finally {
        useClipboardPreferencesStore.setState({ pending: false });
    }
}

export async function dismissClipboardHint(database: ApplicationDatabase) {
    useClipboardPreferencesStore.setState({ hintDismissed: true });
    await new SystemPreferencesRepository(database).setClipboardHintDismissed();
}

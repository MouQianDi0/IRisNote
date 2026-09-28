import { useCallback, useEffect } from "react";
import { useApplicationDatabase } from "@/core/database";
import {
    dismissClipboardHint,
    loadClipboardPreferences,
    setClipboardAutoDetect,
    useClipboardPreferencesStore,
} from "../state/clipboard-preferences-store";

export function useClipboardPreferences() {
    const database = useApplicationDatabase();
    const state = useClipboardPreferencesStore();
    useEffect(() => {
        void loadClipboardPreferences(database).catch(() => undefined);
    }, [database]);
    const setAutoDetect = useCallback(
        (enabled: boolean) => setClipboardAutoDetect(database, enabled),
        [database],
    );
    const dismissHint = useCallback(
        () => dismissClipboardHint(database),
        [database],
    );
    return { ...state, setAutoDetect, dismissHint };
}

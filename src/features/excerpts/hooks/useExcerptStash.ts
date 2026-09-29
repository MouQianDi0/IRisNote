import { useCallback, useMemo, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useApplicationDatabase } from "@/core/database";
import { ExcerptStashRepository, type ExcerptStashItem } from "../data/excerpt-stash.repository";
import { excerptRepository } from "../state/excerpt-store";

/** 页面聚焦时从 SQLite 刷新；两个窗口不会同时可交互。 */
export function useExcerptStash(ownerKey: string, ready: boolean) {
    const database = useApplicationDatabase();
    const repository = useMemo(() => new ExcerptStashRepository(database, excerptRepository), [database]);
    const [items, setItems] = useState<ExcerptStashItem[]>([]);
    const refresh = useCallback(async () => {
        if (!ready) { setItems([]); return; }
        setItems(await repository.list(ownerKey));
    }, [ownerKey, ready, repository]);
    useFocusEffect(useCallback(() => { void refresh().catch(() => setItems([])); }, [refresh]));
    return { items, repository, refresh };
}

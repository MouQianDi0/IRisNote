import { useCallback, useMemo, useRef, useState } from "react";
import { useFocusEffect } from "expo-router";
import { useApplicationDatabase } from "@/core/database";
import { ExcerptStashRepository, type ExcerptStashItem } from "../data/excerpt-stash.repository";
import { excerptRepository } from "../state/excerpt-store";

/** SQLite 为事实源；旧账号或已失焦的迟到查询不能覆盖当前列表。 */
export function useExcerptStash(ownerKey: string, ready: boolean) {
    const database = useApplicationDatabase();
    const repository = useMemo(() => new ExcerptStashRepository(database, excerptRepository), [database]);
    const [snapshot, setSnapshot] = useState<{ ownerKey: string; items: ExcerptStashItem[] }>({ ownerKey, items: [] });
    const request = useRef(0);
    const refresh = useCallback(async () => {
        const ticket = ++request.current;
        if (!ready) { setSnapshot({ ownerKey, items: [] }); return; }
        const items = await repository.list(ownerKey);
        if (ticket === request.current) setSnapshot({ ownerKey, items });
    }, [ownerKey, ready, repository]);
    useFocusEffect(useCallback(() => {
        let active = true;
        void refresh().catch(() => { if (active) setSnapshot({ ownerKey, items: [] }); });
        return () => { active = false; request.current++; };
    }, [ownerKey, refresh]));
    const items = ready && snapshot.ownerKey === ownerKey ? snapshot.items : [];
    return { items, repository, refresh };
}

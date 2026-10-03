import { useApplicationDatabase } from "@/core/database";
import { useCallback, useEffect, useRef, useState } from "react";
import type { NoteRevision } from "../data/note-revision.repository";
import {
    readHistoryRevision,
    readNoteHistory,
} from "../services/note-history.service";

type HistorySnapshot = Awaited<ReturnType<typeof readNoteHistory>>;
const message = (cause: unknown) =>
    cause instanceof Error ? cause.message : "读取历史版本失败，请重试";

/** 每次打开重读本地历史；关闭、换账号、卸载后丢弃迟到的读取结果。 */
export function useNoteHistory(owner: number, clientId: number) {
    const database = useApplicationDatabase();
    const generation = useRef(0);
    const [snapshot, setSnapshot] = useState<HistorySnapshot | null>(null);
    const [selected, setSelected] = useState<NoteRevision | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const invalidate = useCallback(() => {
        generation.current++;
    }, []);
    useEffect(() => invalidate, [invalidate, owner, clientId]);

    const refresh = useCallback(async () => {
        const request = ++generation.current;
        setLoading(true);
        setError("");
        setSnapshot(null);
        setSelected(null);
        try {
            const result = await readNoteHistory(database, owner, clientId);
            if (generation.current === request) setSnapshot(result);
        } catch (cause) {
            if (generation.current === request) setError(message(cause));
        } finally {
            if (generation.current === request) setLoading(false);
        }
    }, [database, owner, clientId]);

    const select = useCallback(
        async (revisionId: string) => {
            const request = ++generation.current;
            setLoading(true);
            setError("");
            setSelected(null);
            try {
                const revision = await readHistoryRevision(
                    database,
                    owner,
                    clientId,
                    revisionId,
                );
                if (generation.current === request) setSelected(revision);
            } catch (cause) {
                if (generation.current === request) setError(message(cause));
            } finally {
                if (generation.current === request) setLoading(false);
            }
        },
        [database, owner, clientId],
    );

    return { snapshot, selected, loading, error, refresh, select, invalidate };
}

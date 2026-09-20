import type { ApplicationDatabase } from "@/core/database";
import type { NotesSyncTransport } from "../api/notes-sync.types";
import { getLocalNotes } from "../data/note-local.repository";
import {
    applyChanges,
    projectMirror,
    readSyncState,
    resetSnapshot,
    stageSnapshot,
} from "../data/note-sync.repository";

function expired(error: unknown): boolean {
    const response = (
        error as {
            response?: {
                status?: number;
                data?: { error?: { code?: string } };
            };
        }
    )?.response;
    return (
        response?.status === 410 &&
        ["SNAPSHOT_EXPIRED", "SYNC_CURSOR_EXPIRED"].includes(
            response.data?.error?.code ?? "",
        )
    );
}

/** The coordinator owns session/write guards; this service is also exercised against real SQLite. */
export async function runNoteSync(
    db: ApplicationDatabase,
    owner: number,
    transport: NotesSyncTransport,
    signal: AbortSignal,
    guard: () => void = () => {},
) {
    const check = () => {
        if (signal.aborted) throw new Error("笔记同步已取消");
        guard();
    };
    const limit = 50;
    let restarts = 0;
    for (;;) {
        check();
        try {
            let state = await readSyncState(db, owner);
            while (!state.changes_cursor) {
                check();
                const page = await transport.snapshot(
                    owner,
                    {
                        limit,
                        ...(state.snapshot_cursor && state.snapshot_token
                            ? {
                                  cursor: state.snapshot_cursor,
                                  snapshot_token: state.snapshot_token,
                              }
                            : {}),
                    },
                    signal,
                );
                check();
                if (
                    page.page.has_more &&
                    (!page.data.length ||
                        page.page.next_cursor === state.snapshot_cursor)
                ) {
                    throw new Error("快照分页没有前进");
                }
                await stageSnapshot(db, owner, page, state, check);
                state = await readSyncState(db, owner);
            }
            // Catch up after a frozen snapshot before displaying it, including writes during interrupted pagination.
            let cursor: string = state.changes_cursor;
            // A persisted page cursor may still carry a pre-write watermark. The second round
            // starts a fresh watermark before projection, even after an interrupted download.
            for (let round = 0; round < 2; round++) {
                for (;;) {
                    check();
                    const page = await transport.changes(
                        owner,
                        cursor,
                        limit,
                        signal,
                    );
                    check();
                    if (
                        page.page.has_more &&
                        (!page.data.length || page.page.next_cursor === cursor)
                    )
                        throw new Error("增量分页没有前进");
                    await applyChanges(db, owner, cursor, page, check);
                    cursor = page.page.next_cursor;
                    if (!page.page.has_more) break;
                }
            }
            const stats = await projectMirror(db, owner, check);
            check();
            const notes = await getLocalNotes(db, owner);
            check();
            return { ...stats, notes };
        } catch (error) {
            check();
            if (!expired(error) || restarts++ >= 1) throw error;
            await resetSnapshot(db, owner, check);
        }
    }
}

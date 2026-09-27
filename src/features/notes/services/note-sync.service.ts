import type { ApplicationDatabase } from "@/core/database";
import { notifyUploadQueueChanged } from "@/core/sync/upload-queue.events";
import type {
    CloudNote,
    NotesSyncTransport,
} from "../api/notes-sync.types";
import {
    evictNoteBodies,
    NOTE_BODY_KEEP_RECENT,
} from "../data/note-body.repository";
import { fillLocalContentHashes } from "../data/note-content-hash";
import { getLocalNotes } from "../data/note-local.repository";
import {
    applyChanges,
    projectMirror,
    readBodyPlan,
    readSyncState,
    resetSnapshot,
    stageSnapshot,
    type MirrorMode,
} from "../data/note-sync.repository";

const BATCH_LIMIT = 50;

// Notes open in a viewer or editor keep their bodies while visible.
const holds = new Map<number, number>();

/** 打开笔记期间保留其正文；返回释放函数。 */
export function holdNoteBody(clientId: number) {
    holds.set(clientId, (holds.get(clientId) ?? 0) + 1);
    let released = false;
    return () => {
        if (released) return;
        released = true;
        const count = (holds.get(clientId) ?? 1) - 1;
        if (count > 0) holds.set(clientId, count);
        else holds.delete(clientId);
    };
}

export function heldNoteBodies(): ReadonlySet<number> {
    return new Set(holds.keys());
}

/** 元数据模式下按保留范围下载正文（每次最多 50 篇）；超出范围的新笔记只插入摘要。 */
async function downloadBodies(
    db: ApplicationDatabase,
    owner: number,
    transport: NotesSyncTransport,
    signal: AbortSignal,
    check: () => void,
) {
    const bodies = new Map<number, CloudNote>();
    if (!transport.batch) return { bodies, evictedInserts: new Set<number>() };
    await fillLocalContentHashes(db, owner, check);
    check();
    const plan = await readBodyPlan(db, owner, NOTE_BODY_KEEP_RECENT);
    for (let index = 0; index < plan.fetch.length; index += BATCH_LIMIT) {
        check();
        const page = await transport.batch(
            owner,
            plan.fetch.slice(index, index + BATCH_LIMIT),
            signal,
        );
        check();
        for (const note of page.data) bodies.set(note.id, note);
    }
    return { bodies, evictedInserts: plan.evictedInserts };
}

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
    // Metadata mode needs the second-phase server; when that cannot be determined now, keep the current mode.
    let supported: boolean | null = false;
    if (transport.supportsMeta) {
        try {
            supported = await transport.supportsMeta();
        } catch {
            supported = null;
        }
    }
    check();
    for (;;) {
        check();
        try {
            let state = await readSyncState(db, owner);
            const current: MirrorMode = state.mirror_mode ?? "full";
            const mode: MirrorMode =
                supported === null ? current : supported ? "meta" : "full";
            if (mode !== current) {
                // Snapshot tokens are bound to the mode, so switching restarts collection.
                await resetSnapshot(db, owner, check, mode);
                state = await readSyncState(db, owner);
            }
            const fields = mode === "meta" ? ("meta" as const) : undefined;
            while (!state.changes_cursor) {
                check();
                const page = await transport.snapshot(
                    owner,
                    {
                        limit,
                        ...(fields ? { fields } : {}),
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
                        fields,
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
            const plan =
                mode === "meta"
                    ? await downloadBodies(db, owner, transport, signal, check)
                    : undefined;
            const stats = await projectMirror(
                db,
                owner,
                check,
                plan?.bodies,
                plan?.evictedInserts,
            );
            // Adopted creates may have unblocked their upload tasks.
            if (stats.linkedCount) notifyUploadQueueChanged();
            check();
            // Bodies are only evicted when the metadata mirror confirms the cloud holds the same content.
            if (mode === "meta") {
                await fillLocalContentHashes(db, owner, check);
                await evictNoteBodies(
                    db,
                    owner,
                    NOTE_BODY_KEEP_RECENT,
                    heldNoteBodies(),
                    check,
                );
                check();
            }
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

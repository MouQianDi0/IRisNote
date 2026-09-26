import type {
    ApplicationDatabase,
    ApplicationDatabaseTransaction as Tx,
} from "@/core/database";
import {
    cloudNoteToLocal,
    parseCloudNote,
    type ChangesPage,
    type SnapshotPage,
} from "../api/notes-sync.types";
import { reconcileNotesInTransaction } from "./note-local.repository";
import { deleteNoteRevisions } from "./note-revision.repository";
import {
    archiveLocalNote,
    recordRemoteDeletion,
    restoreFromRemote,
} from "./note-trash.repository";
import { NOTE_TRASH_MS } from "../api/notes-trash.types";

export type SyncState = {
    changes_cursor: string | null;
    snapshot_token: string | null;
    snapshot_cursor: string | null;
    snapshot_changes_cursor: string | null;
    completed_at: string | null;
};
export async function readSyncState(db: Tx, owner: number): Promise<SyncState> {
    return (
        (await db.getFirst<SyncState>(
            "SELECT * FROM note_sync_state WHERE owner_user_id=?",
            [owner],
        )) ?? {
            changes_cursor: null,
            snapshot_token: null,
            snapshot_cursor: null,
            snapshot_changes_cursor: null,
            completed_at: null,
        }
    );
}
async function ensureState(tx: Tx, owner: number) {
    await tx.run(
        "INSERT OR IGNORE INTO note_sync_state(owner_user_id) VALUES(?)",
        [owner],
    );
}
export async function resetSnapshot(
    db: ApplicationDatabase,
    owner: number,
    check: () => void,
) {
    await db.transaction(async (tx) => {
        check();
        await ensureState(tx, owner);
        await tx.run("DELETE FROM note_sync_snapshot WHERE owner_user_id=?", [
            owner,
        ]);
        await tx.run(
            `UPDATE note_sync_state SET changes_cursor=NULL, snapshot_token=NULL,
            snapshot_cursor=NULL,snapshot_changes_cursor=NULL WHERE owner_user_id=?`,
            [owner],
        );
        check();
    });
}
export async function stageSnapshot(
    db: ApplicationDatabase,
    owner: number,
    page: SnapshotPage,
    expected: SyncState,
    check: () => void,
) {
    await db.transaction(async (tx) => {
        check();
        await ensureState(tx, owner);
        const state = await readSyncState(tx, owner);
        if (
            state.changes_cursor !== null ||
            state.snapshot_cursor !== expected.snapshot_cursor ||
            state.snapshot_token !== expected.snapshot_token
        )
            throw new Error("同步状态已变化，请重试");
        if (
            expected.snapshot_token &&
            (page.page.snapshot_token !== expected.snapshot_token ||
                page.sync.changes_cursor !== expected.snapshot_changes_cursor)
        )
            throw new Error("快照身份发生变化");
        for (const note of page.data) {
            await tx.run(
                `INSERT INTO note_sync_snapshot(owner_user_id,server_id,cloud_id,version,payload)
                VALUES(?,?,?,?,?)`,
                [
                    owner,
                    note.id,
                    note.client_id,
                    note.version,
                    JSON.stringify(note),
                ],
            );
        }
        if (page.page.has_more) {
            await tx.run(
                `UPDATE note_sync_state SET snapshot_token=?,snapshot_cursor=?,snapshot_changes_cursor=? WHERE owner_user_id=?`,
                [
                    page.page.snapshot_token,
                    page.page.next_cursor,
                    page.sync.changes_cursor,
                    owner,
                ],
            );
        } else {
            // Replace only the cloud mirror. Local edits/drafts are not touched by snapshot collection.
            await tx.run("DELETE FROM note_sync_mirror WHERE owner_user_id=?", [
                owner,
            ]);
            await tx.run(
                `INSERT INTO note_sync_mirror SELECT * FROM note_sync_snapshot WHERE owner_user_id=?`,
                [owner],
            );
            await tx.run(
                "DELETE FROM note_sync_snapshot WHERE owner_user_id=?",
                [owner],
            );
            await tx.run(
                `UPDATE note_sync_state SET changes_cursor=?,snapshot_token=NULL,snapshot_cursor=NULL,
                snapshot_changes_cursor=NULL WHERE owner_user_id=?`,
                [page.sync.changes_cursor, owner],
            );
        }
        check();
    });
}
export async function applyChanges(
    db: ApplicationDatabase,
    owner: number,
    cursor: string,
    page: ChangesPage,
    check: () => void,
) {
    return db.transaction(async (tx) => {
        check();
        if ((await readSyncState(tx, owner)).changes_cursor !== cursor)
            throw new Error("同步游标已变化，请重试");
        for (const event of page.data) {
            const row = event.operation === "upsert" ? event.data : event;
            const payload =
                event.operation === "upsert"
                    ? JSON.stringify(event.data)
                    : null;
            const old = await tx.getFirst<{
                cloud_id: string;
                version: number;
                payload: string | null;
            }>(
                "SELECT cloud_id,version,payload FROM note_sync_mirror WHERE owner_user_id=? AND server_id=?",
                [owner, row.id],
            );
            if (old && old.cloud_id !== row.client_id)
                throw new Error("云端笔记身份发生变化");
            if (old && old.version >= row.version) {
                if (old.version === row.version && old.payload !== payload)
                    throw new Error("同版本笔记内容不一致");
                continue;
            }
            // Restores are server-authorized newer versions. Older/equal events were rejected above.
            if (event.operation === "delete") {
                await recordRemoteDeletion(tx, owner, {
                    ...event,
                    expires_at: new Date(
                        Date.parse(event.deleted_at) + NOTE_TRASH_MS,
                    ).toISOString(),
                });
            }
            await tx.run(
                `INSERT INTO note_sync_mirror(owner_user_id,server_id,cloud_id,version,payload) VALUES(?,?,?,?,?)
                ON CONFLICT(owner_user_id,server_id) DO UPDATE SET version=excluded.version,payload=excluded.payload`,
                [owner, row.id, row.client_id, row.version, payload],
            );
        }
        await tx.run(
            "UPDATE note_sync_state SET changes_cursor=? WHERE owner_user_id=?",
            [page.page.next_cursor, owner],
        );
        check();
    });
}
export async function readCloudMirror(db: Tx, owner: number) {
    const rows = await db.getAll<{ payload: string }>(
        "SELECT payload FROM note_sync_mirror WHERE owner_user_id=? AND payload IS NOT NULL ORDER BY server_id",
        [owner],
    );
    return rows.map((row) => parseCloudNote(JSON.parse(row.payload), owner));
}

/** Projection runs after catching up, so intermediate historical events cannot roll back a write receipt. */
export async function projectMirror(
    db: ApplicationDatabase,
    owner: number,
    check: () => void,
) {
    return db.transaction(async (tx) => {
        check();
        const rows = await readCloudMirror(tx, owner);
        for (const row of rows) await restoreFromRemote(tx, owner, row);
        const addedCount = await reconcileNotesInTransaction(
            tx,
            owner,
            rows.map(cloudNoteToLocal),
            undefined,
            undefined,
            true,
        );
        const missing = await tx.getAll<{
            client_id: number;
            sync_status: string;
        }>(
            `SELECT n.client_id,n.sync_status FROM local_notes n
            LEFT JOIN note_sync_mirror m ON m.owner_user_id=n.owner_user_id AND m.server_id=n.server_id
            WHERE n.owner_user_id=? AND n.server_id IS NOT NULL AND m.payload IS NULL`,
            [owner],
        );
        for (const row of missing) {
            if (await archiveLocalNote(tx, owner, row.client_id)) continue;
            const draft = await tx.getFirst<{ present: number }>(
                "SELECT 1 AS present FROM note_drafts WHERE owner_user_id=? AND note_id=? LIMIT 1",
                [owner, row.client_id],
            );
            if (row.sync_status !== "synced" || draft) {
                // Preserve the candidate and its history. Never automatically recreate a server-deleted note.
                if (row.sync_status !== "syncing") {
                    await tx.run(
                        `UPDATE local_notes SET sync_status='rejected',last_sync_error=? WHERE owner_user_id=? AND client_id=?`,
                        [
                            "云端笔记已删除，本地内容和草稿已保留。请另存为新笔记。",
                            owner,
                            row.client_id,
                        ],
                    );
                    await tx.run(
                        `UPDATE upload_queue_tasks SET status='blocked',last_error=?
                        WHERE owner_user_id=? AND dedupe_key=? AND status!='running'`,
                        [
                            "云端笔记已删除，本地内容已保留",
                            owner,
                            `note:${row.client_id}`,
                        ],
                    );
                }
                continue;
            }
            await deleteNoteRevisions(tx, owner, row.client_id);
            await tx.run(
                "DELETE FROM local_notes WHERE owner_user_id=? AND client_id=?",
                [owner, row.client_id],
            );
        }
        await tx.run(
            "UPDATE note_sync_state SET completed_at=? WHERE owner_user_id=?",
            [new Date().toISOString(), owner],
        );
        check();
        return { addedCount };
    });
}

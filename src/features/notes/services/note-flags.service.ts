import type { ApplicationDatabase } from "@/core/database";
import {
    captureCloudStorageAccess,
    captureLocalStorageAccess,
} from "@/core/cloud-storage/cloud-storage-policy";
import { getLocalNoteByClientId } from "../data/note-local.repository";
import { beginNoteCloudWrite, notifyNotesChanged } from "../notes.events";
import { setCachedNote } from "../notes.cache";

export async function toggleLocalNoteFlag(
    db: ApplicationDatabase,
    owner: number,
    id: number,
    flag: "is_pinned" | "is_starred",
) {
    const check = captureLocalStorageAccess(owner);
    const finish = beginNoteCloudWrite();
    try {
        await db.transaction(async (tx) => {
            check();
            const row = await tx.getFirst<{
                is_pinned: number;
                is_starred: number;
            }>(
                "SELECT is_pinned,is_starred FROM local_notes WHERE owner_user_id=? AND client_id=?",
                [owner, id],
            );
            if (!row) throw new Error("笔记已移入垃圾桶或不存在");
            const next = row[flag] ? 0 : 1;
            await tx.run(
                `INSERT INTO note_local_flags(owner_user_id,client_id,${flag}) VALUES(?,?,?)
                ON CONFLICT(owner_user_id,client_id) DO UPDATE SET ${flag}=excluded.${flag},version=version+1`,
                [owner, id, next],
            );
            await tx.run(
                `UPDATE local_notes SET ${flag}=?${flag === "is_pinned" ? ",pinned_order=CASE WHEN ?=1 THEN (SELECT COALESCE(MAX(pinned_order),0)+1 FROM local_notes WHERE owner_user_id=?) ELSE NULL END" : ""}
                WHERE owner_user_id=? AND client_id=?`,
                flag === "is_pinned"
                    ? [next, next, owner, owner, id]
                    : [next, owner, id],
            );
            check();
        });
        check();
        const note = await getLocalNoteByClientId(db, owner, id);
        check();
        if (!note) throw new Error("笔记状态已变化");
        setCachedNote(note);
        notifyNotesChanged({ type: "upsert", note });
        return note;
    } finally {
        finish();
    }
}

const jobs = new WeakMap<ApplicationDatabase, Map<number, Promise<void>>>();
/** Separate metadata outbox: never uploads a missing body or changes a text revision. */
export async function syncLocalNoteFlags(
    db: ApplicationDatabase,
    owner: number,
) {
    let owners = jobs.get(db);
    if (!owners) {
        owners = new Map();
        jobs.set(db, owners);
    }
    if (owners.has(owner)) return owners.get(owner)!;
    const check = captureCloudStorageAccess(owner);
    const work = (async () => {
        if (
            !(await db.getFirst(
                "SELECT 1 FROM sqlite_master WHERE name='note_local_flags'",
            ))
        )
            return;
        const rows = await db.getAll<{
            client_id: number;
            server_id: number;
            is_pinned: number | null;
            is_starred: number | null;
            version: number;
        }>(
            `SELECT f.*,n.server_id FROM note_local_flags f JOIN local_notes n
             ON n.owner_user_id=f.owner_user_id AND n.client_id=f.client_id
             WHERE f.owner_user_id=? AND n.server_id IS NOT NULL`,
            [owner],
        );
        if (!rows.length) return;
        const { updateNote } = await import("../api/notes.api");
        for (const row of rows) {
            check();
            await updateNote(row.server_id, {
                ...(row.is_pinned === null
                    ? {}
                    : { is_pinned: Boolean(row.is_pinned) }),
                ...(row.is_starred === null
                    ? {}
                    : { is_starred: Boolean(row.is_starred) }),
            });
            check();
            await db.run(
                "DELETE FROM note_local_flags WHERE owner_user_id=? AND client_id=? AND version=?",
                [owner, row.client_id, row.version],
            );
        }
    })().finally(() => owners.delete(owner));
    owners.set(owner, work);
    return work;
}

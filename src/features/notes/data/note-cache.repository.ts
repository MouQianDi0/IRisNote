import type {
    ApplicationDatabase,
    ApplicationDatabaseTransaction as Tx,
} from "@/core/database";
import { parseCloudNote } from "../api/notes-sync.types";

export type EvictedNoteIdentity = {
    client_id: number;
    local_order: number | null;
    pinned_order: number | null;
    current_revision_id: string | null;
};
const identityKey = (owner: number, serverId: number) =>
    `note-cache-identity:${owner}:${serverId}`;

export async function readEvictedNoteIdentity(
    tx: Tx,
    owner: number,
    serverId: number,
) {
    // Reconciliation is also used by migration-level diagnostics on older schemas.
    if (
        !(await tx.getFirst(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='system_preferences'",
        ))
    )
        return null;
    const row = await tx.getFirst<{ value: string }>(
        "SELECT value FROM system_preferences WHERE key=?",
        [identityKey(owner, serverId)],
    );
    if (!row) return null;
    const value: unknown = JSON.parse(row.value);
    if (
        !value ||
        typeof value !== "object" ||
        !("client_id" in value) ||
        !Number.isSafeInteger(value.client_id) ||
        !("local_order" in value) ||
        !(
            value.local_order === null ||
            Number.isSafeInteger(value.local_order)
        ) ||
        !("pinned_order" in value) ||
        !(
            value.pinned_order === null ||
            Number.isSafeInteger(value.pinned_order)
        ) ||
        !("current_revision_id" in value) ||
        !(
            value.current_revision_id === null ||
            typeof value.current_revision_id === "string"
        )
    ) {
        throw new Error("笔记缓存身份记录损坏，已保留原数据");
    }
    return value as EvictedNoteIdentity;
}
export async function removeEvictedNoteIdentity(
    tx: Tx,
    owner: number,
    serverId: number,
) {
    await tx.run("DELETE FROM system_preferences WHERE key=?", [
        identityKey(owner, serverId),
    ]);
}

type Candidate = EvictedNoteIdentity & {
    server_id: number;
    title: string;
    content: string | null;
    category_id: number | null;
    is_pinned: number;
    is_starred: number;
    server_updated_at: string | null;
    payload: string;
    bytes: number;
};

export async function readNoteCacheCandidates(
    tx: Tx,
    owner: number,
): Promise<Candidate[]> {
    const trash = await tx.getFirst(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='note_trash'",
    );
    const rows = await tx.getAll<Candidate>(
        `SELECT n.client_id,n.server_id,n.title,n.content,n.category_id,
    n.is_pinned,n.is_starred,n.server_updated_at,n.local_order,n.pinned_order,n.current_revision_id,m.payload,
    length(CAST(n.title AS BLOB))+COALESCE(length(CAST(n.content AS BLOB)),0)+length(CAST(m.payload AS BLOB)) AS bytes
    FROM local_notes n JOIN note_sync_mirror m ON m.owner_user_id=n.owner_user_id AND m.server_id=n.server_id
    WHERE n.owner_user_id=? AND n.sync_status='synced' AND n.sync_operation IS NULL AND m.payload IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM note_drafts d WHERE d.owner_user_id=n.owner_user_id AND d.note_id=n.client_id)
    AND NOT EXISTS (SELECT 1 FROM upload_queue_tasks q WHERE q.owner_user_id=n.owner_user_id AND q.dedupe_key='note:'||n.client_id)
    ${trash ? "AND NOT EXISTS (SELECT 1 FROM note_trash r WHERE r.owner_user_id=n.owner_user_id AND r.server_id=n.server_id)" : ""}`,
        [owner],
    );
    return rows.filter((row) => {
        try {
            const cloud = parseCloudNote(JSON.parse(row.payload), owner);
            return (
                cloud.id === row.server_id &&
                cloud.title === row.title &&
                cloud.content === row.content &&
                cloud.category_id === row.category_id &&
                cloud.updated_at === row.server_updated_at &&
                Boolean(cloud.is_pinned) === Boolean(row.is_pinned) &&
                Boolean(cloud.is_starred) === Boolean(row.is_starred)
            );
        } catch {
            return false;
        }
    });
}

/** Caller verifies cloud availability and suspends synchronization. No cloud delete is issued. */
export async function evictNoteCache(
    db: ApplicationDatabase,
    owner: number,
    confirmed: readonly Candidate[],
    check: () => void,
) {
    return db.transaction(async (tx) => {
        check();
        const expected = new Map(
            confirmed.map((row) => [row.client_id, JSON.stringify(row)]),
        );
        const candidates = (await readNoteCacheCandidates(tx, owner)).filter(
            (row) => expected.get(row.client_id) === JSON.stringify(row),
        );
        const ids: number[] = [];
        for (const row of candidates) {
            check();
            const identity: EvictedNoteIdentity = {
                client_id: row.client_id,
                local_order: row.local_order,
                pinned_order: row.pinned_order,
                current_revision_id: row.current_revision_id,
            };
            await tx.run(
                `INSERT INTO system_preferences(key,value,updated_at) VALUES(?,?,?)
        ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at`,
                [
                    identityKey(owner, row.server_id),
                    JSON.stringify(identity),
                    new Date().toISOString(),
                ],
            );
            await tx.run(
                "DELETE FROM local_notes WHERE owner_user_id=? AND client_id=?",
                [owner, row.client_id],
            );
            await tx.run(
                "DELETE FROM note_sync_mirror WHERE owner_user_id=? AND server_id=?",
                [owner, row.server_id],
            );
            ids.push(row.client_id);
        }
        if (ids.length) {
            // An incremental cursor cannot restore evicted rows with no new server changes.
            await tx.run(
                "DELETE FROM note_sync_snapshot WHERE owner_user_id=?",
                [owner],
            );
            await tx.run("DELETE FROM note_sync_state WHERE owner_user_id=?", [
                owner,
            ]);
        }
        check();
        return { ids, skipped: confirmed.length - ids.length };
    });
}

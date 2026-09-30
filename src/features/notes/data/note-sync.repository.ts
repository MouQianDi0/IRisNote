import { localCategoryMap } from "../categories/data/category-local.repository";
import type {
    ApplicationDatabase,
    ApplicationDatabaseTransaction as Tx,
} from "@/core/database";
import {
    cloudNoteToLocal,
    isCloudNoteMeta,
    parseMirrorNote,
    type ChangesPage,
    type CloudNote,
    type CloudNoteMeta,
    type MirrorNote,
    type SnapshotPage,
} from "../api/notes-sync.types";
import { hasBodyState } from "./note-body.repository";
import {
    readEvictedNoteIdentity,
    removeEvictedNoteIdentity,
} from "./note-cache.repository";
import { linkCreatedNotes } from "./note-create-operation.repository";
import { reconcileNotesInTransaction } from "./note-local.repository";
import { deleteNoteReadingProgress } from "./note-reading-progress.repository";
import { deleteNoteRevisions } from "./note-revision.repository";
import {
    archiveLocalNote,
    recordRemoteDeletion,
    removedServerIds,
    restoreFromRemote,
    readTrashIntent,
} from "./note-trash.repository";
import { NOTE_TRASH_MS } from "../api/notes-trash.types";

export type MirrorMode = "full" | "meta";
export type SyncState = {
    changes_cursor: string | null;
    snapshot_token: string | null;
    snapshot_cursor: string | null;
    snapshot_changes_cursor: string | null;
    completed_at: string | null;
    /** 0017 之前的结构没有该列，视为 full。 */
    mirror_mode?: MirrorMode;
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
/**
 * 重新建立快照。传入 `mode` 时同时切换镜像模式：快照令牌与模式绑定，必须从头取一轮；
 * 现有镜像保留到新快照取完才整体替换，期间两种格式的记录可能并存。
 */
export async function resetSnapshot(
    db: ApplicationDatabase,
    owner: number,
    check: () => void,
    mode?: MirrorMode,
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
        if (mode)
            await tx.run(
                "UPDATE note_sync_state SET mirror_mode=? WHERE owner_user_id=?",
                [mode, owner],
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
export async function readCloudMirror(
    db: Tx,
    owner: number,
): Promise<MirrorNote[]> {
    const rows = await db.getAll<{ payload: string }>(
        "SELECT payload FROM note_sync_mirror WHERE owner_user_id=? AND payload IS NOT NULL ORDER BY server_id",
        [owner],
    );
    return rows.map((row) => parseMirrorNote(JSON.parse(row.payload), owner));
}

async function hasNoteTrash(db: Tx) {
    return Boolean(
        await db.getFirst(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='note_trash'",
        ),
    );
}

/**
 * 元数据镜像的正文下载计划（服务端 ID）：
 * - 下载：已同步但正文哈希与云端不同的、被置顶或星标的已淘汰笔记、垃圾桶里被其他设备恢复的，
 *   以及本机还没有、且在保留范围内（置顶、星标，或按修改时间从新到旧补满 keepRecent 篇）的新笔记。
 * - 只插入摘要：本机还没有、超出保留范围的新笔记（旧结构数据库不支持时照常下载）。
 * 未同步的本地修改不在此列（合并时会跳过）。调用前先补算本地哈希。
 */
export async function readBodyPlan(db: Tx, owner: number, keepRecent: number) {
    const trash = await hasNoteTrash(db);
    const bodyState = await hasBodyState(db);
    const rows = await db.getAll<{
        payload: string;
        local_hash: string | null;
        local_null: number | null;
        sync_status: string | null;
        body_state: string | null;
        trash_version: number | null;
        trash_state: string | null;
        purged: number | null;
    }>(
        `SELECT m.payload, n.content_hash AS local_hash, n.content IS NULL AS local_null, n.sync_status,
        ${bodyState ? "n.body_state" : "NULL"} AS body_state,
        ${trash ? "t.version" : "NULL"} AS trash_version, ${trash ? "t.state" : "NULL"} AS trash_state,
        ${
            trash
                ? "(SELECT 1 FROM note_trash_purged p WHERE p.owner_user_id=m.owner_user_id AND p.server_id=m.server_id)"
                : "NULL"
        } AS purged
        FROM note_sync_mirror m
        LEFT JOIN local_notes n ON n.owner_user_id=m.owner_user_id AND n.server_id=m.server_id
        ${trash ? "LEFT JOIN note_trash t ON t.owner_user_id=m.owner_user_id AND t.server_id=m.server_id" : ""}
        WHERE m.owner_user_id=? AND m.payload IS NOT NULL ORDER BY m.server_id`,
        [owner],
    );
    const fetch: number[] = [];
    const fresh: CloudNoteMeta[] = [];
    for (const row of rows) {
        const note = parseMirrorNote(JSON.parse(row.payload), owner);
        if (!isCloudNoteMeta(note)) continue;
        if (row.trash_state !== null) {
            if (
                row.trash_state !== "deleting" &&
                (row.trash_version ?? 0) < note.version
            )
                fetch.push(note.id);
            continue;
        }
        if (row.purged) continue;
        if (row.sync_status === null) {
            fresh.push(note);
            continue;
        }
        if (row.sync_status !== "synced") continue;
        if (row.body_state === "evicted") {
            if (note.is_pinned || note.is_starred) fetch.push(note.id);
            continue;
        }
        const same = row.local_null
            ? note.content_hash === null
            : row.local_hash !== null && row.local_hash === note.content_hash;
        if (!same) fetch.push(note.id);
    }
    const evictedInserts = new Set<number>();
    if (!bodyState) {
        fetch.push(...fresh.map((note) => note.id));
        return { fetch, evictedInserts };
    }
    let budget =
        keepRecent -
        ((
            await db.getFirst<{ count: number }>(
                `SELECT count(*) AS count FROM local_notes WHERE owner_user_id=? AND server_id IS NOT NULL
                 AND body_state='present' AND is_pinned=0 AND is_starred=0`,
                [owner],
            )
        )?.count ?? 0);
    const recency = (note: CloudNoteMeta) => note.updated_at ?? note.created_at;
    for (const note of [...fresh].sort((a, b) =>
        recency(b).localeCompare(recency(a)),
    )) {
        if (note.is_pinned || note.is_starred) fetch.push(note.id);
        else if (budget-- > 0) fetch.push(note.id);
        else evictedInserts.add(note.id);
    }
    return { fetch, evictedInserts };
}

/**
 * 已淘汰正文的笔记只更新元数据与摘要（不动正文、不建版本）；本机还没有、计划只插入摘要的新笔记
 * 以淘汰状态插入，沿用清理缓存留下的本地身份。未同步或正文在本机的笔记不经过这里。
 */
async function applyMetadataOnly(
    tx: Tx,
    owner: number,
    rows: readonly { note: CloudNoteMeta; index: number }[],
    evictedInserts: ReadonlySet<number>,
) {
    const removed = await removedServerIds(tx, owner);
    const categoryIds = await localCategoryMap(tx, owner);
    let added = 0;
    for (const { note: incoming, index } of rows) {
        const note = {
            ...incoming,
            category_id:
                incoming.category_id === null
                    ? null
                    : (categoryIds.get(incoming.category_id) ??
                      incoming.category_id),
        };
        const local = await tx.getFirst<{ client_id: number }>(
            "SELECT client_id FROM local_notes WHERE owner_user_id=? AND server_id=?",
            [owner, note.id],
        );
        if (local) {
            await tx.run(
                `UPDATE local_notes SET title=?, category_id=?, created_at=?, is_pinned=?, is_starred=?,
                 server_updated_at=?, local_updated_at=COALESCE(?, local_updated_at),
                 content_hash=?, content_preview=?, content_length=?
                 WHERE owner_user_id=? AND client_id=? AND body_state='evicted' AND sync_status='synced'`,
                [
                    note.title,
                    note.category_id,
                    note.created_at,
                    note.is_pinned ? 1 : 0,
                    note.is_starred ? 1 : 0,
                    note.updated_at,
                    note.updated_at,
                    note.content_hash,
                    note.content_preview,
                    note.content_length,
                    owner,
                    local.client_id,
                ],
            );
            continue;
        }
        if (!evictedInserts.has(note.id) || removed.has(note.id)) continue;
        const identity = await readEvictedNoteIdentity(tx, owner, note.id);
        await tx.run(
            `INSERT INTO local_notes (owner_user_id, client_id, server_id, title, content, category_id, created_at,
                is_pinned, is_starred, local_order, pinned_order, sync_status, sync_operation, local_updated_at,
                server_updated_at, current_revision_id, body_state, content_hash, content_preview, content_length)
             VALUES (?,?,?,?,NULL,?,?,?,?,?,?,'synced',NULL,?,?,?,'evicted',?,?,?)`,
            [
                owner,
                identity?.client_id ?? note.id,
                note.id,
                note.title,
                note.category_id,
                note.created_at,
                note.is_pinned ? 1 : 0,
                note.is_starred ? 1 : 0,
                identity?.local_order ?? index,
                identity?.pinned_order ?? null,
                note.updated_at ?? note.created_at,
                note.updated_at,
                identity?.current_revision_id ?? null,
                note.content_hash,
                note.content_preview,
                note.content_length,
            ],
        );
        if (identity) await removeEvictedNoteIdentity(tx, owner, note.id);
        added++;
    }
    return added;
}

/**
 * 元数据记录补上正文：优先用刚下载的正文，其次在哈希相同时用本地正文；都没有时返回 null，本轮跳过该笔记。
 * 完整记录原样返回。
 */
function withBody(
    row: MirrorNote,
    bodies: ReadonlyMap<number, CloudNote>,
    local: ReadonlyMap<
        number,
        {
            content: string | null;
            content_hash: string | null;
            body_state: string;
        }
    >,
): CloudNote | null {
    if (!isCloudNoteMeta(row)) return row;
    const body = bodies.get(row.id);
    if (body && body.version >= row.version) return body;
    const copy = local.get(row.id);
    // An evicted body is not a local copy of the content.
    if (!copy || copy.body_state === "evicted") return null;
    const same =
        copy.content === null
            ? row.content_hash === null
            : copy.content_hash !== null &&
              copy.content_hash === row.content_hash;
    if (!same) return null;
    const {
        content_hash: _hash,
        content_length: _length,
        content_preview: _preview,
        ...base
    } = row;
    return { ...base, content: copy.content };
}

/**
 * Projection runs after catching up, so intermediate historical events cannot roll back a write receipt.
 * In metadata mode `bodies` carries the downloaded contents; notes whose body is unknown are skipped this round.
 */
export async function projectMirror(
    db: ApplicationDatabase,
    owner: number,
    check: () => void,
    bodies: ReadonlyMap<number, CloudNote> = new Map(),
    evictedInserts: ReadonlySet<number> = new Set(),
) {
    return db.transaction(async (tx) => {
        check();
        // Adopt notes created by an unconfirmed idempotent request before they can appear as a second copy.
        const linkedCount = await linkCreatedNotes(tx, owner);
        const mirror = await readCloudMirror(tx, owner);
        const bodyState = await hasBodyState(tx);
        const local = mirror.some(isCloudNoteMeta)
            ? new Map(
                  (
                      await tx.getAll<{
                          server_id: number;
                          content: string | null;
                          content_hash: string | null;
                          body_state: string;
                      }>(
                          `SELECT server_id,content,content_hash,${bodyState ? "body_state" : "'present' AS body_state"}
                           FROM local_notes WHERE owner_user_id=? AND server_id IS NOT NULL`,
                          [owner],
                      )
                  ).map((row) => [row.server_id, row]),
              )
            : new Map();
        const rows: CloudNote[] = [];
        const metadataOnly: { note: CloudNoteMeta; index: number }[] = [];
        for (const [index, row] of mirror.entries()) {
            const note = withBody(row, bodies, local);
            if (note) rows.push(note);
            else if (isCloudNoteMeta(row))
                metadataOnly.push({ note: row, index });
        }
        for (const row of rows) await restoreFromRemote(tx, owner, row);
        let addedCount = await reconcileNotesInTransaction(
            tx,
            owner,
            rows.map(cloudNoteToLocal),
            undefined,
            undefined,
            true,
        );
        if (bodyState && metadataOnly.length)
            addedCount += await applyMetadataOnly(
                tx,
                owner,
                metadataOnly,
                evictedInserts,
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
            if (
                (await readTrashIntent(tx, owner, row.client_id))?.intent ===
                "restore"
            )
                continue;
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
            await deleteNoteReadingProgress(tx, owner, row.client_id);
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
        return { addedCount, linkedCount };
    });
}

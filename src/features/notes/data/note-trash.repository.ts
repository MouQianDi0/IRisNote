import type { ApplicationDatabaseTransaction as Tx } from "@/core/database";
import type { CloudNote } from "../api/notes-sync.types";
import {
    NOTE_TRASH_MS,
    type DeletedCloudNote,
    type NoteDeletion,
} from "../api/notes-trash.types";
import type { NoteDraft } from "./note-draft.repository";
import { insertNoteRevision } from "./note-revision.repository";
import { enqueueNoteUpload } from "@/features/sync/note-upload-queue";
import type { NoteSyncOperation, NoteSyncStatus } from "../notes.types";

export type TrashRow = {
    owner_user_id: number;
    client_id: number;
    server_id: number | null;
    cloud_id: string | null;
    version: number;
    deleted_at: string | null;
    expires_at: string | null;
    state: "local" | "deleting" | "deleted" | "unresolved";
    local_json: string | null;
    cloud_json: string | null;
    drafts_json: string | null;
    last_error: string | null;
};
type LocalRow = {
    owner_user_id: number;
    client_id: number;
    server_id: number | null;
    title: string;
    content: string | null;
    category_id: number | null;
    created_at: string;
    is_pinned: number;
    is_starred: number;
    local_order: number | null;
    pinned_order: number | null;
    sync_status: NoteSyncStatus;
    sync_operation: NoteSyncOperation | null;
    last_sync_error: string | null;
    local_updated_at: string;
    server_updated_at: string | null;
    current_revision_id: string | null;
};
const localColumns = [
    "owner_user_id",
    "client_id",
    "server_id",
    "title",
    "content",
    "category_id",
    "created_at",
    "is_pinned",
    "is_starred",
    "local_order",
    "pinned_order",
    "sync_status",
    "sync_operation",
    "last_sync_error",
    "local_updated_at",
    "server_updated_at",
    "current_revision_id",
] as const;

/** Old-schema migration diagnostics must retain their existing behavior. App startup requires v12. */
export async function hasNoteTrash(db: Tx) {
    return Boolean(
        await db.getFirst(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='note_trash'",
        ),
    );
}
export function listNoteTrash(db: Tx, owner: number) {
    return db.getAll<TrashRow>(
        "SELECT * FROM note_trash WHERE owner_user_id=? ORDER BY deleted_at DESC,client_id DESC",
        [owner],
    );
}
export function readTrash(db: Tx, owner: number, clientId: number) {
    return db.getFirst<TrashRow>(
        "SELECT * FROM note_trash WHERE owner_user_id=? AND client_id=?",
        [owner, clientId],
    );
}
export async function readServerTrash(db: Tx, owner: number, serverId: number) {
    if (!(await hasNoteTrash(db))) return null;
    return db.getFirst<TrashRow>(
        "SELECT * FROM note_trash WHERE owner_user_id=? AND server_id=?",
        [owner, serverId],
    );
}
export function trashReceipt(row: TrashRow): NoteDeletion {
    if (
        !row.server_id ||
        !row.cloud_id ||
        !row.deleted_at ||
        !row.expires_at ||
        row.version < 1
    )
        throw new Error("笔记删除状态尚未确认，请联网刷新");
    return {
        id: row.server_id,
        client_id: row.cloud_id,
        version: row.version,
        deleted_at: row.deleted_at,
        expires_at: row.expires_at,
    };
}
export function trashPreview(row: TrashRow): {
    title: string;
    content: string | null;
} {
    const parsed: unknown = JSON.parse(
        row.local_json ?? row.cloud_json ?? "null",
    );
    if (
        !parsed ||
        typeof parsed !== "object" ||
        !("title" in parsed) ||
        typeof parsed.title !== "string"
    )
        return { title: "已删除笔记", content: null };
    return {
        title: parsed.title,
        content:
            "content" in parsed && typeof parsed.content === "string"
                ? parsed.content
                : null,
    };
}
export async function recordRemoteDeletion(
    tx: Tx,
    owner: number,
    receipt: NoteDeletion,
    cloud?: DeletedCloudNote,
) {
    if (!(await hasNoteTrash(tx))) return;
    const old = await readServerTrash(tx, owner, receipt.id);
    if (old && old.version > receipt.version) return;
    if (old?.cloud_id && old.cloud_id !== receipt.client_id)
        throw new Error("垃圾桶云端身份不一致");
    const local = await tx.getFirst<{ client_id: number }>(
        "SELECT client_id FROM local_notes WHERE owner_user_id=? AND server_id=?",
        [owner, receipt.id],
    );
    const identity =
        !old && !local
            ? await tx.getFirst<{ value: string }>(
                  "SELECT value FROM system_preferences WHERE key=?",
                  [`note-cache-identity:${owner}:${receipt.id}`],
              )
            : null;
    const evicted: unknown = identity ? JSON.parse(identity.value) : null;
    const evictedId =
        evicted &&
        typeof evicted === "object" &&
        "client_id" in evicted &&
        typeof evicted.client_id === "number" &&
        Number.isSafeInteger(evicted.client_id)
            ? evicted.client_id
            : null;
    await tx.run(
        `INSERT INTO note_trash(owner_user_id,client_id,server_id,cloud_id,version,deleted_at,expires_at,state,cloud_json)
        VALUES(?,?,?,?,?,?,?,'deleted',?) ON CONFLICT(owner_user_id,server_id) DO UPDATE SET
        cloud_id=excluded.cloud_id,version=excluded.version,deleted_at=excluded.deleted_at,expires_at=excluded.expires_at,
        state='deleted',cloud_json=COALESCE(excluded.cloud_json,note_trash.cloud_json),last_error=NULL`,
        [
            owner,
            old?.client_id ?? local?.client_id ?? evictedId ?? receipt.id,
            receipt.id,
            receipt.client_id,
            receipt.version,
            receipt.deleted_at,
            receipt.expires_at,
            cloud ? JSON.stringify(cloud) : null,
        ],
    );
}

/** Archive the row, drafts and queue atomically. Revision history stays attached to the same client ID. */
export async function archiveLocalNote(
    tx: Tx,
    owner: number,
    clientId: number,
    state: TrashRow["state"] = "unresolved",
    expected?: CloudNote,
    requireIdle = false,
) {
    if (!(await hasNoteTrash(tx))) return false;
    const local = await tx.getFirst<LocalRow>(
        `SELECT ${localColumns.join(",")} FROM local_notes WHERE owner_user_id=? AND client_id=?`,
        [owner, clientId],
    );
    if (!local) {
        if (requireIdle) throw new Error("本地笔记已变化，请刷新后再删除");
        return true;
    }
    const running = await tx.getFirst(
        "SELECT 1 FROM upload_queue_tasks WHERE owner_user_id=? AND dedupe_key=? AND status='running'",
        [owner, `note:${clientId}`],
    );
    if (
        local.sync_status === "syncing" ||
        running ||
        (local.server_id === null && local.sync_status === "unknown")
    ) {
        if (requireIdle)
            throw new Error(
                "笔记正在上传或上传结果尚未确认，请同步完成后再删除",
            );
        return false;
    }
    const old = await readTrash(tx, owner, clientId);
    const drafts = await tx.getAll<NoteDraft>(
        "SELECT * FROM note_drafts WHERE owner_user_id=? AND note_id=?",
        [owner, clientId],
    );
    const now = new Date().toISOString();
    await tx.run(
        `INSERT INTO note_trash(owner_user_id,client_id,server_id,cloud_id,version,deleted_at,expires_at,state,local_json,drafts_json)
        VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(owner_user_id,client_id) DO UPDATE SET
        local_json=excluded.local_json,drafts_json=excluded.drafts_json`,
        [
            owner,
            clientId,
            local.server_id,
            expected?.client_id ?? null,
            expected?.version ?? 0,
            state === "local" ? now : null,
            state === "local"
                ? new Date(Date.parse(now) + NOTE_TRASH_MS).toISOString()
                : null,
            state,
            JSON.stringify(local),
            JSON.stringify(
                drafts.length
                    ? drafts
                    : old?.drafts_json
                      ? JSON.parse(old.drafts_json)
                      : [],
            ),
        ],
    );
    await tx.run(
        "DELETE FROM upload_queue_tasks WHERE owner_user_id=? AND dedupe_key=?",
        [owner, `note:${clientId}`],
    );
    await tx.run(
        "DELETE FROM note_drafts WHERE owner_user_id=? AND note_id=?",
        [owner, clientId],
    );
    await tx.run(
        "DELETE FROM local_notes WHERE owner_user_id=? AND client_id=?",
        [owner, clientId],
    );
    return true;
}

export async function restoreArchivedNote(
    tx: Tx,
    owner: number,
    row: TrashRow,
    cloud?: CloudNote,
) {
    if (
        row.owner_user_id !== owner ||
        (cloud &&
            (cloud.user_id !== owner ||
                cloud.id !== row.server_id ||
                (cloud.client_id !== row.cloud_id && row.cloud_id !== null)))
    ) {
        throw new Error("垃圾桶笔记归属或身份不一致");
    }
    const alreadyActive = await tx.getFirst(
        "SELECT 1 FROM local_notes WHERE owner_user_id=? AND client_id=?",
        [owner, row.client_id],
    );
    if (!alreadyActive) {
        const local: LocalRow | null = row.local_json
            ? JSON.parse(row.local_json)
            : null;
        if (!local && !cloud) throw new Error("此笔记未缓存在本机，请联网恢复");
        if (
            local &&
            (local.owner_user_id !== owner || local.client_id !== row.client_id)
        )
            throw new Error("本地垃圾桶记录损坏");
        const localTime = local
            ? Date.parse(
                  local.sync_status === "synced"
                      ? (local.server_updated_at ?? "")
                      : local.local_updated_at,
              )
            : NaN;
        const cloudTime = cloud ? Date.parse(cloud.updated_at ?? "") : NaN;
        const textDiffers =
            local &&
            cloud &&
            (local.title !== cloud.title || local.content !== cloud.content);
        const keepLocal = Boolean(
            local &&
            (!cloud ||
                (local.sync_status !== "synced" &&
                    (!Number.isFinite(cloudTime) || localTime >= cloudTime))),
        );
        const conflict = Boolean(
            keepLocal && textDiffers && localTime === cloudTime,
        );
        const content = keepLocal ? local! : cloud!;
        const next: LocalRow = {
            owner_user_id: owner,
            client_id: row.client_id,
            server_id: row.server_id,
            title: content.title,
            content: content.content,
            category_id: cloud ? cloud.category_id : content.category_id,
            created_at: content.created_at,
            is_pinned: Number(Boolean(cloud?.is_pinned ?? local?.is_pinned)),
            is_starred: Number(Boolean(cloud?.is_starred ?? local?.is_starred)),
            local_order: local?.local_order ?? null,
            pinned_order: local?.pinned_order ?? null,
            sync_status: cloud
                ? conflict
                    ? "rejected"
                    : keepLocal && textDiffers
                      ? "pending"
                      : "synced"
                : "pending",
            sync_operation: cloud
                ? keepLocal && textDiffers
                    ? "update"
                    : null
                : "create",
            last_sync_error: conflict
                ? "修改时间相同但内容不同，已保留本地内容，请核对后修改并保存。"
                : null,
            local_updated_at: keepLocal
                ? local!.local_updated_at
                : (cloud!.updated_at ?? cloud!.created_at),
            server_updated_at:
                cloud?.updated_at ?? local?.server_updated_at ?? null,
            current_revision_id: local?.current_revision_id ?? null,
        };
        if (
            !next.current_revision_id ||
            next.title !== local?.title ||
            next.content !== local?.content ||
            next.category_id !== local?.category_id
        ) {
            next.current_revision_id = await insertNoteRevision(
                tx,
                owner,
                row.client_id,
                {
                    parentId: next.current_revision_id,
                    title: next.title,
                    content: next.content,
                    categoryId: next.category_id,
                    origin: "restore",
                },
            );
        }
        await tx.run(
            `INSERT INTO local_notes(${localColumns.join(",")}) VALUES(${localColumns.map(() => "?").join(",")})`,
            localColumns.map((key) => next[key]),
        );
        const drafts: NoteDraft[] = JSON.parse(row.drafts_json ?? "[]");
        if (next.sync_status === "pending") await enqueueNoteUpload(tx, owner, {
            id: row.client_id, server_id: next.server_id, user_id: owner, title: next.title, content: next.content,
            category_id: next.category_id, created_at: next.created_at, current_revision_id: next.current_revision_id, sync_operation: next.sync_operation,
        });
        for (const draft of drafts) {
            if (
                draft.owner_user_id !== owner ||
                draft.note_id !== row.client_id
            )
                throw new Error("垃圾桶草稿归属不一致");
            await tx.run(
                `INSERT OR IGNORE INTO note_drafts(owner_user_id,draft_key,session_id,note_id,base_snapshot,base_revision_id,title,content,category_id,sequence,updated_at)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
                [
                    owner,
                    draft.draft_key,
                    draft.session_id,
                    row.client_id,
                    draft.base_snapshot,
                    draft.base_revision_id,
                    draft.title,
                    draft.content,
                    cloud?.category_id === null ? null : draft.category_id,
                    draft.sequence,
                    draft.updated_at,
                ],
            );
        }
    }
    await tx.run(
        "DELETE FROM note_trash WHERE owner_user_id=? AND client_id=?",
        [owner, row.client_id],
    );
}

export async function restoreFromRemote(
    tx: Tx,
    owner: number,
    cloud: CloudNote,
) {
    const row = await readServerTrash(tx, owner, cloud.id);
    if (!row || row.state === "deleting" || row.version >= cloud.version)
        return;
    await restoreArchivedNote(tx, owner, row, cloud);
}

export async function purgeLocalTrash(
    tx: Tx,
    owner: number,
    expected: TrashRow,
) {
    const row = await readTrash(tx, owner, expected.client_id);
    if (
        !row ||
        row.state !== expected.state ||
        row.version !== expected.version ||
        row.deleted_at !== expected.deleted_at ||
        row.cloud_id !== expected.cloud_id
    )
        return false;
    if (
        await tx.getFirst(
            "SELECT 1 FROM local_notes WHERE owner_user_id=? AND client_id=?",
            [owner, row.client_id],
        )
    )
        return false;
    await tx.run(
        "DELETE FROM note_revisions WHERE owner_user_id=? AND client_id=?",
        [owner, row.client_id],
    );
    await tx.run(
        "DELETE FROM note_drafts WHERE owner_user_id=? AND note_id=?",
        [owner, row.client_id],
    );
    await tx.run(
        "DELETE FROM upload_queue_tasks WHERE owner_user_id=? AND dedupe_key=?",
        [owner, `note:${row.client_id}`],
    );
    // A full snapshot is required after dropping any cached content for this identity.
    if (row.server_id !== null) {
        await tx.run(
            "DELETE FROM note_sync_mirror WHERE owner_user_id=? AND server_id=?",
            [owner, row.server_id],
        );
        await tx.run("DELETE FROM note_sync_snapshot WHERE owner_user_id=?", [
            owner,
        ]);
        await tx.run("DELETE FROM note_sync_state WHERE owner_user_id=?", [
            owner,
        ]);
        await tx.run("DELETE FROM system_preferences WHERE key=?", [
            `note-cache-identity:${owner}:${row.server_id}`,
        ]);
    }
    await tx.run(
        "DELETE FROM note_trash WHERE owner_user_id=? AND client_id=?",
        [owner, row.client_id],
    );
    return true;
}

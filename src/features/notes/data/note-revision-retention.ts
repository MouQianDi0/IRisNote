import type {
    ApplicationDatabase,
    ApplicationDatabaseTransaction as Tx,
} from "@/core/database";

/** 每篇笔记最多保留的历史版本数；仍被引用的版本另行保留，不占这个名额。 */
export const NOTE_REVISION_LIMIT = 50;

const DELETE_CHUNK = 200;

type RevisionLink = { revision_id: string; parent_revision_id: string | null };

async function tableExists(tx: Tx, name: string) {
    return !!(await tx.getFirst(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        [name],
    ));
}

/** 解析失败返回 undefined，调用方据此放弃裁剪，而不是冒险删掉可能被引用的版本。 */
function parseJson(text: string | null): unknown {
    if (!text) return null;
    try {
        return JSON.parse(text) as unknown;
    } catch {
        return undefined;
    }
}

function field(value: unknown, key: string): unknown {
    return value && typeof value === "object" && key in value
        ? (value as Record<string, unknown>)[key]
        : undefined;
}

/**
 * 收集这篇笔记仍被引用的版本：当前版本、草稿基准、回收站里的当前版本与草稿基准、
 * 被清理笔记缓存记下的版本、上传队列记下的版本。任一记录无法解析时返回 null。
 */
async function referencedRevisions(
    tx: Tx,
    owner: number,
    clientId: number,
): Promise<Set<string> | null> {
    const ids = new Set<string>();
    const add = (value: unknown) => {
        if (typeof value === "string" && value) ids.add(value);
    };
    const note = await tx.getFirst<{ current_revision_id: string | null }>(
        "SELECT current_revision_id FROM local_notes WHERE owner_user_id=? AND client_id=?",
        [owner, clientId],
    );
    add(note?.current_revision_id);
    for (const row of await tx.getAll<{ base_revision_id: string | null }>(
        "SELECT base_revision_id FROM note_drafts WHERE owner_user_id=? AND note_id=?",
        [owner, clientId],
    ))
        add(row.base_revision_id);

    if (await tableExists(tx, "note_trash")) {
        const trash = await tx.getFirst<{
            local_json: string | null;
            drafts_json: string | null;
        }>(
            "SELECT local_json, drafts_json FROM note_trash WHERE owner_user_id=? AND client_id=?",
            [owner, clientId],
        );
        if (trash) {
            const local = parseJson(trash.local_json);
            const drafts = parseJson(trash.drafts_json);
            if (local === undefined || drafts === undefined) return null;
            if (drafts !== null && !Array.isArray(drafts)) return null;
            add(field(local, "current_revision_id"));
            for (const draft of drafts ?? [])
                add(field(draft, "base_revision_id"));
        }
    }

    if (await tableExists(tx, "system_preferences")) {
        for (const row of await tx.getAll<{ value: string }>(
            "SELECT value FROM system_preferences WHERE key LIKE ?",
            [`note-cache-identity:${owner}:%`],
        )) {
            const identity = parseJson(row.value);
            if (identity === undefined) return null;
            if (field(identity, "client_id") === clientId)
                add(field(identity, "current_revision_id"));
        }
    }

    if (await tableExists(tx, "upload_queue_tasks")) {
        for (const row of await tx.getAll<{ payload_json: string }>(
            "SELECT payload_json FROM upload_queue_tasks WHERE owner_user_id=? AND dedupe_key=?",
            [owner, `note:${clientId}`],
        )) {
            const payload = parseJson(row.payload_json);
            if (payload === undefined) return null;
            add(field(payload, "revisionId"));
        }
    }
    return ids;
}

/**
 * 在调用方事务内裁剪一篇笔记的历史版本：保留最新的 limit 个，
 * 另外保留仍被引用的版本及其上一版（上传队列“回滚到上一版”需要）。返回删除数量。
 * `alsoKeep` 用于刚插入、指针尚未移动的版本：同一毫秒内的版本按 ID 排序不一定反映先后。
 */
export async function pruneNoteRevisions(
    tx: Tx,
    owner: number,
    clientId: number,
    limit = NOTE_REVISION_LIMIT,
    alsoKeep: readonly (string | null)[] = [],
): Promise<number> {
    const revisions = await tx.getAll<RevisionLink>(
        `SELECT revision_id, parent_revision_id FROM note_revisions
         WHERE owner_user_id=? AND client_id=?
         ORDER BY created_at DESC, revision_id DESC`,
        [owner, clientId],
    );
    if (revisions.length <= limit) return 0;
    const referenced = await referencedRevisions(tx, owner, clientId);
    if (!referenced) return 0;
    for (const id of alsoKeep) if (id) referenced.add(id);
    const parents = new Map(
        revisions.map((row) => [row.revision_id, row.parent_revision_id]),
    );
    const keep = new Set(revisions.slice(0, limit).map((row) => row.revision_id));
    for (const id of referenced) {
        keep.add(id);
        const parent = parents.get(id);
        if (parent) keep.add(parent);
    }
    const removed = revisions
        .map((row) => row.revision_id)
        .filter((id) => !keep.has(id));
    for (let index = 0; index < removed.length; index += DELETE_CHUNK) {
        const chunk = removed.slice(index, index + DELETE_CHUNK);
        await tx.run(
            `DELETE FROM note_revisions WHERE owner_user_id=? AND revision_id IN (${chunk
                .map(() => "?")
                .join(",")})`,
            [owner, ...chunk],
        );
    }
    return removed.length;
}

/** 启动维护：找出超过上限的笔记，每篇在各自的事务里裁剪。返回删除总数。 */
export async function pruneAllNoteRevisions(
    database: ApplicationDatabase,
    limit = NOTE_REVISION_LIMIT,
): Promise<number> {
    const notes = await database.getAll<{
        owner_user_id: number;
        client_id: number;
    }>(
        `SELECT owner_user_id, client_id FROM note_revisions
         GROUP BY owner_user_id, client_id HAVING COUNT(*) > ?`,
        [limit],
    );
    let removed = 0;
    for (const note of notes)
        removed += await database.transaction((tx) =>
            pruneNoteRevisions(tx, note.owner_user_id, note.client_id, limit),
        );
    return removed;
}

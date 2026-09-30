import type {
    ApplicationDatabase,
    ApplicationDatabaseTransaction as Tx,
} from "@/core/database";

/** 置顶、星标、有草稿、未同步和正在打开的笔记之外，最近打开的这么多篇保留正文。 */
export const NOTE_BODY_KEEP_RECENT = 300;

/** 旧结构数据库（只建到部分迁移的诊断库、历史测试）没有正文状态列时，淘汰相关功能全部跳过。 */
export async function hasBodyState(db: Tx) {
    return Boolean(
        await db.getFirst(
            "SELECT 1 AS present FROM pragma_table_info('local_notes') WHERE name='body_state'",
        ),
    );
}

/** 已淘汰笔记的摘要（client_id → 摘要），供列表与回收站显示；省略 clientId 时读取全部。 */
export async function readEvictedPreviews(
    db: Tx,
    owner: number,
    clientId?: number,
) {
    if (!(await hasBodyState(db))) return new Map<number, string | null>();
    const rows = await db.getAll<{
        client_id: number;
        content_preview: string | null;
    }>(
        `SELECT client_id,content_preview FROM local_notes WHERE owner_user_id=? AND body_state='evicted'${
            clientId === undefined ? "" : " AND client_id=?"
        }`,
        clientId === undefined ? [owner] : [owner, clientId],
    );
    return new Map(rows.map((row) => [row.client_id, row.content_preview]));
}

export async function markNoteOpened(db: Tx, owner: number, clientId: number) {
    if (!(await hasBodyState(db))) return;
    await db.run(
        "UPDATE local_notes SET last_opened_at=? WHERE owner_user_id=? AND client_id=?",
        [new Date().toISOString(), owner, clientId],
    );
}

type Candidate = {
    client_id: number;
    content_hash: string;
    preview: string | null;
    length: number | null;
};

/**
 * 可以淘汰正文的笔记，按最近打开（从没打开过的按修改时间）从新到旧排列。
 * 只选已同步、没有本地修改、没有草稿和上传任务、未置顶未星标、且元数据镜像哈希与本地正文一致
 * （确认云端存着同样内容）的笔记；完整模式镜像没有哈希，因此旧服务端下不会淘汰。
 */
async function readCandidates(tx: Tx, owner: number) {
    return tx.getAll<Candidate>(
        `SELECT n.client_id, n.content_hash,
            json_extract(m.payload,'$.content_preview') AS preview,
            json_extract(m.payload,'$.content_length') AS length
         FROM local_notes n
         JOIN note_sync_mirror m ON m.owner_user_id=n.owner_user_id AND m.server_id=n.server_id
         WHERE n.owner_user_id=? AND n.server_id IS NOT NULL
           AND n.sync_status='synced' AND n.sync_operation IS NULL
           AND n.body_state='present' AND n.content IS NOT NULL AND n.content_hash IS NOT NULL
           AND n.is_pinned=0 AND n.is_starred=0
           AND m.payload IS NOT NULL AND json_extract(m.payload,'$.content_hash') = n.content_hash
           AND NOT EXISTS (SELECT 1 FROM note_drafts d WHERE d.owner_user_id=n.owner_user_id AND d.note_id=n.client_id)
           AND NOT EXISTS (SELECT 1 FROM upload_queue_tasks q WHERE q.owner_user_id=n.owner_user_id AND q.dedupe_key='note:'||n.client_id)
         ORDER BY COALESCE(n.last_opened_at, n.server_updated_at, n.local_updated_at) DESC, n.client_id DESC`,
        [owner],
    );
}

/**
 * 淘汰超出保留范围的正文：保留最近打开的 `keepRecent` 篇（`exclude` 中的笔记不占名额也不淘汰），
 * 其余清空正文、改为 evicted，摘要与长度取自云端元数据，哈希保留。历史版本不动。
 * 需要先补算本地哈希（fillLocalContentHashes），没有哈希的笔记不会被淘汰。
 */
export async function evictNoteBodies(
    db: ApplicationDatabase,
    owner: number,
    keepRecent: number,
    exclude: ReadonlySet<number>,
    check: () => void,
) {
    return db.transaction(async (tx) => {
        check();
        if (!(await hasBodyState(tx))) return 0;
        const victims = (await readCandidates(tx, owner))
            .filter((row) => !exclude.has(row.client_id))
            .slice(keepRecent);
        let evicted = 0;
        for (const row of victims) {
            const result = await tx.run(
                `UPDATE local_notes SET content=NULL, body_state='evicted', content_preview=?, content_length=?
                 WHERE owner_user_id=? AND client_id=? AND body_state='present' AND sync_status='synced'
                   AND sync_operation IS NULL AND content_hash=?`,
                [row.preview, row.length, owner, row.client_id, row.content_hash],
            );
            evicted += result.changes;
        }
        check();
        return evicted;
    });
}

/** 存储页统计：本机有正文的、只剩摘要的，以及现在可以释放正文的篇数。 */
export async function readNoteBodyStats(
    db: Tx,
    owner: number,
    exclude: ReadonlySet<number> = new Set(),
) {
    if (!(await hasBodyState(db)))
        return { present: 0, evicted: 0, releasable: 0 };
    const counts = await db.getAll<{ body_state: string; count: number }>(
        "SELECT body_state, count(*) AS count FROM local_notes WHERE owner_user_id=? GROUP BY body_state",
        [owner],
    );
    const count = (state: string) =>
        counts.find((row) => row.body_state === state)?.count ?? 0;
    const releasable = (await readCandidates(db, owner)).filter(
        (row) => !exclude.has(row.client_id),
    ).length;
    return {
        present: count("present"),
        evicted: count("evicted"),
        releasable,
    };
}

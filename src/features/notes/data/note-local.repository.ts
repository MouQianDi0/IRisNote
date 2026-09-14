import type {
    ApplicationDatabase,
    ApplicationDatabaseTransaction,
} from "@/core/database";
import type {
    CreateNotePayload,
    Note,
    NoteSyncOperation,
    NoteSyncStatus,
    UpdateNotePayload,
} from "../notes.types";
import { assertDraftCommit, linkCommittedDraft, type DraftCommit } from "./note-draft.repository";
import {
    deleteNoteRevisions,
    getCurrentNoteRevision,
    getNoteRevisionById,
    insertNoteRevision,
    revisionContentEquals,
} from "./note-revision.repository";

type LocalNoteRow = {
    local_id: number;
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
    current_revision_id: string | null;
};

const LOCAL_NOTE_COLUMNS = `
    local_id,
    owner_user_id,
    client_id,
    server_id,
    title,
    content,
    category_id,
    created_at,
    is_pinned,
    is_starred,
    local_order,
    pinned_order,
    sync_status,
    sync_operation,
    last_sync_error,
    local_updated_at,
    current_revision_id
`;

const toNote = (row: LocalNoteRow): Note => ({
    id: row.client_id,
    server_id: row.server_id,
    user_id: row.owner_user_id,
    title: row.title,
    content: row.content,
    category_id: row.category_id,
    created_at: row.created_at,
    is_pinned: Boolean(row.is_pinned),
    is_starred: Boolean(row.is_starred),
    local_order: row.local_order ?? undefined,
    pinned_order: row.pinned_order ?? undefined,
    sync_status: row.sync_status,
    sync_operation: row.sync_operation,
    last_sync_error: row.last_sync_error,
    local_updated_at: row.local_updated_at,
    current_revision_id: row.current_revision_id,
});

async function readNoteByClientId(
    database: ApplicationDatabaseTransaction,
    ownerUserId: number,
    clientId: number,
) {
    const row = await database.getFirst<LocalNoteRow>(
        `SELECT ${LOCAL_NOTE_COLUMNS}
         FROM local_notes
         WHERE owner_user_id = $ownerUserId AND client_id = $clientId`,
        { $ownerUserId: ownerUserId, $clientId: clientId },
    );
    return row ? toNote(row) : null;
}

export async function getLocalNotes(
    database: ApplicationDatabase,
    ownerUserId: number,
) {
    const rows = await database.getAll<LocalNoteRow>(
        `SELECT ${LOCAL_NOTE_COLUMNS}
         FROM local_notes
         WHERE owner_user_id = $ownerUserId
         ORDER BY COALESCE(local_order, 2147483647) ASC, local_updated_at DESC`,
        { $ownerUserId: ownerUserId },
    );
    return rows.map(toNote);
}

export async function recoverInterruptedNoteSyncs(
    database: ApplicationDatabase,
    ownerUserId: number,
) {
    await database.run(
        `UPDATE local_notes
         SET sync_status = 'unknown',
             last_sync_error = '应用在云端请求完成前中断，服务器是否接收未知。'
         WHERE owner_user_id = $ownerUserId AND sync_status = 'syncing'`,
        { $ownerUserId: ownerUserId },
    );
}

export function getLocalNoteByClientId(
    database: ApplicationDatabase,
    ownerUserId: number,
    clientId: number,
) {
    return readNoteByClientId(database, ownerUserId, clientId);
}

export async function createPendingLocalNote(
    database: ApplicationDatabase,
    ownerUserId: number,
    payload: CreateNotePayload,
    draft?: DraftCommit,
) {
    return database.transaction(async (transaction) => {
        await assertDraftCommit(transaction, ownerUserId, draft, null);
        const now = new Date().toISOString();
        const result = await transaction.run(
            `INSERT INTO local_notes (
                owner_user_id,
                client_id,
                server_id,
                title,
                content,
                category_id,
                created_at,
                local_order,
                sync_status,
                sync_operation,
                local_updated_at
             ) VALUES (
                $ownerUserId,
                NULL,
                NULL,
                $title,
                $content,
                $categoryId,
                $createdAt,
                0,
                'pending',
                'create',
                $localUpdatedAt
             )`,
            {
                $ownerUserId: ownerUserId,
                $title: payload.title,
                $content: payload.content,
                $categoryId: payload.category_id ?? null,
                $createdAt: now,
                $localUpdatedAt: now,
            },
        );
        const clientId = -Number(result.lastInsertRowId);
        await transaction.run(
            `UPDATE local_notes
             SET client_id = $clientId
             WHERE local_id = $localId`,
            {
                $clientId: clientId,
                $localId: Number(result.lastInsertRowId),
            },
        );

        const note = await readNoteByClientId(
            transaction,
            ownerUserId,
            clientId,
        );
        if (!note) {
            throw new Error("[Note local] Created note could not be reloaded.");
        }
        // 首次保存形成 V1：笔记与版本在同一事务内创建。
        const revisionId = await insertNoteRevision(
            transaction,
            ownerUserId,
            clientId,
            {
                parentId: null,
                title: payload.title,
                content: payload.content,
                categoryId: payload.category_id ?? null,
                origin: "local-save",
            },
        );
        await transaction.run(
            `UPDATE local_notes
             SET current_revision_id = $revisionId
             WHERE owner_user_id = $ownerUserId AND client_id = $clientId`,
            {
                $revisionId: revisionId,
                $ownerUserId: ownerUserId,
                $clientId: clientId,
            },
        );
        const saved = await readNoteByClientId(
            transaction,
            ownerUserId,
            clientId,
        );
        if (!saved) {
            throw new Error("[Note local] Created note could not be reloaded.");
        }
        await linkCommittedDraft(transaction, ownerUserId, draft, saved);
        return { note: saved, revisionCreated: true };
    });
}

export async function updatePendingLocalNote(
    database: ApplicationDatabase,
    ownerUserId: number,
    note: Note,
    payload: UpdateNotePayload,
    draft?: DraftCommit,
) {
    return database.transaction(async (transaction) => {
        const existing = await readNoteByClientId(
            transaction,
            ownerUserId,
            note.id,
        );
        await assertDraftCommit(transaction, ownerUserId, draft, existing ?? note);
        const serverId =
            existing?.server_id ??
            note.server_id ??
            (note.id > 0 ? note.id : null);
        const operation: NoteSyncOperation =
            existing?.sync_operation === "create" || serverId == null
                ? "create"
                : "update";
        const now = new Date().toISOString();
        const nextNote: Note = {
            ...note,
            ...payload,
            server_id: serverId,
            user_id: ownerUserId,
            content: payload.content ?? note.content,
            category_id:
                payload.category_id === undefined
                    ? note.category_id
                    : payload.category_id,
        };

        // 无变化不建版本；但 pending 状态照写，上传重试仍会执行。
        const currentRevision = await getCurrentNoteRevision(
            transaction,
            ownerUserId,
            note.id,
        );
        const revisionCreated =
            !currentRevision ||
            !revisionContentEquals(
                {
                    title: nextNote.title,
                    content: nextNote.content,
                    categoryId: nextNote.category_id ?? null,
                },
                currentRevision,
            );
        const revisionId = revisionCreated
            ? await insertNoteRevision(transaction, ownerUserId, note.id, {
                  parentId: currentRevision?.revision_id ?? null,
                  title: nextNote.title,
                  content: nextNote.content,
                  categoryId: nextNote.category_id ?? null,
                  origin: "local-save",
              })
            : null;

        await transaction.run(
            `INSERT INTO local_notes (
                owner_user_id,
                client_id,
                server_id,
                title,
                content,
                category_id,
                created_at,
                is_pinned,
                is_starred,
                local_order,
                pinned_order,
                sync_status,
                sync_operation,
                last_sync_error,
                local_updated_at,
                current_revision_id
             ) VALUES (
                $ownerUserId,
                $clientId,
                $serverId,
                $title,
                $content,
                $categoryId,
                $createdAt,
                $isPinned,
                $isStarred,
                $localOrder,
                $pinnedOrder,
                'pending',
                $syncOperation,
                NULL,
                $localUpdatedAt,
                $revisionId
             )
             ON CONFLICT (owner_user_id, client_id) DO UPDATE SET
                server_id = excluded.server_id,
                title = excluded.title,
                content = excluded.content,
                category_id = excluded.category_id,
                is_pinned = excluded.is_pinned,
                is_starred = excluded.is_starred,
                local_order = excluded.local_order,
                pinned_order = excluded.pinned_order,
                sync_status = 'pending',
                sync_operation = excluded.sync_operation,
                last_sync_error = NULL,
                local_updated_at = excluded.local_updated_at,
                current_revision_id = COALESCE(
                    excluded.current_revision_id,
                    local_notes.current_revision_id
                )`,
            {
                $ownerUserId: ownerUserId,
                $clientId: note.id,
                $serverId: serverId,
                $title: nextNote.title,
                $content: nextNote.content,
                $categoryId: nextNote.category_id,
                $createdAt: nextNote.created_at,
                $isPinned: nextNote.is_pinned ? 1 : 0,
                $isStarred: nextNote.is_starred ? 1 : 0,
                $localOrder: nextNote.local_order ?? null,
                $pinnedOrder: nextNote.pinned_order ?? null,
                $syncOperation: operation,
                $localUpdatedAt: now,
                $revisionId: revisionId,
            },
        );

        const saved = await readNoteByClientId(
            transaction,
            ownerUserId,
            note.id,
        );
        if (!saved) {
            throw new Error("[Note local] Updated note could not be reloaded.");
        }
        await linkCommittedDraft(transaction, ownerUserId, draft, saved);
        return { note: saved, revisionCreated };
    });
}

export async function markLocalNoteSyncing(
    database: ApplicationDatabase,
    ownerUserId: number,
    clientId: number,
) {
    await database.run(
        `UPDATE local_notes
         SET sync_status = 'syncing', last_sync_error = NULL
         WHERE owner_user_id = $ownerUserId AND client_id = $clientId`,
        { $ownerUserId: ownerUserId, $clientId: clientId },
    );
    return getLocalNoteByClientId(database, ownerUserId, clientId);
}

/** 无变化保存回到已同步状态：内容与云端一致，不重新上传。 */
export async function markLocalNoteSynced(
    database: ApplicationDatabase,
    ownerUserId: number,
    clientId: number,
) {
    await database.run(
        `UPDATE local_notes
         SET sync_status = 'synced', sync_operation = NULL, last_sync_error = NULL
         WHERE owner_user_id = $ownerUserId AND client_id = $clientId`,
        { $ownerUserId: ownerUserId, $clientId: clientId },
    );
    return getLocalNoteByClientId(database, ownerUserId, clientId);
}

export async function markLocalNoteSyncFailed(
    database: ApplicationDatabase,
    ownerUserId: number,
    clientId: number,
    status: Extract<NoteSyncStatus, "rejected" | "unknown">,
    message: string,
    expectedRevisionId?: string | null,
) {
    await database.run(
        `UPDATE local_notes
         SET sync_status = CASE
                 WHEN $protectRevision = 0 OR current_revision_id IS $expectedRevisionId
                     THEN $syncStatus
                 ELSE 'pending'
             END,
             sync_operation = CASE
                 WHEN $protectRevision = 1 AND current_revision_id IS NOT $expectedRevisionId
                     THEN 'update'
                 ELSE sync_operation
             END,
             last_sync_error = CASE
                 WHEN $protectRevision = 0 OR current_revision_id IS $expectedRevisionId
                     THEN $lastSyncError
                 ELSE last_sync_error
             END
         WHERE owner_user_id = $ownerUserId AND client_id = $clientId`,
        {
            $ownerUserId: ownerUserId,
            $clientId: clientId,
            $syncStatus: status,
            $lastSyncError: message,
            $protectRevision: expectedRevisionId === undefined ? 0 : 1,
            $expectedRevisionId: expectedRevisionId ?? null,
        },
    );
    return getLocalNoteByClientId(database, ownerUserId, clientId);
}

export async function acceptServerNote(
    database: ApplicationDatabase,
    ownerUserId: number,
    clientId: number,
    serverNote: Note,
    expectedRevisionId: string | null,
) {
    // 上传刚提交的本地内容是权威；响应正文不再反向覆盖正文字段，
    // 服务器数据统一由 reconcileServerNotes 对账，防止旧响应回滚用户输入。
    await database.run(
        `UPDATE local_notes
         SET server_id = $serverId,
             sync_status = CASE
                 WHEN current_revision_id IS $expectedRevisionId THEN 'synced'
                 ELSE 'pending'
             END,
             sync_operation = CASE
                 WHEN current_revision_id IS $expectedRevisionId THEN NULL
                 ELSE 'update'
             END,
             last_sync_error = NULL,
             local_updated_at = CASE
                 WHEN current_revision_id IS $expectedRevisionId THEN $localUpdatedAt
                 ELSE local_updated_at
             END
         WHERE owner_user_id = $ownerUserId AND client_id = $clientId`,
        {
            $ownerUserId: ownerUserId,
            $clientId: clientId,
            $serverId: serverNote.server_id ?? serverNote.id,
            $expectedRevisionId: expectedRevisionId,
            $localUpdatedAt: new Date().toISOString(),
        },
    );
    return getLocalNoteByClientId(database, ownerUserId, clientId);
}

export async function reconcileServerNotes(
    database: ApplicationDatabase,
    ownerUserId: number,
    serverNotes: Note[],
    onReconciled?: (stats: { addedCount: number }) => void,
) {
    const addedCount = await database.transaction(async (transaction) => {
        let added = 0;
        const serverIds = new Set<number>();

        for (const [index, note] of serverNotes.entries()) {
            const serverId = note.server_id ?? note.id;
            serverIds.add(serverId);
            const existing = await transaction.getFirst<LocalNoteRow>(
                `SELECT ${LOCAL_NOTE_COLUMNS}
                 FROM local_notes
                 WHERE owner_user_id = $ownerUserId AND server_id = $serverId`,
                { $ownerUserId: ownerUserId, $serverId: serverId },
            );

            if (existing && existing.sync_status !== "synced") continue;

            if (existing) {
                // 服务器内容与当前版本不同才追加 server-reconcile 版本，维持
                // “local_notes 内容 ≡ 当前版本内容”的不变量。
                const currentRevision = await getCurrentNoteRevision(
                    transaction,
                    ownerUserId,
                    existing.client_id,
                );
                const contentChanged =
                    !currentRevision ||
                    !revisionContentEquals(
                        {
                            title: note.title,
                            content: note.content,
                            categoryId: note.category_id ?? null,
                        },
                        currentRevision,
                    );
                const revisionId = contentChanged
                    ? await insertNoteRevision(
                          transaction,
                          ownerUserId,
                          existing.client_id,
                          {
                              parentId: currentRevision?.revision_id ?? null,
                              title: note.title,
                              content: note.content,
                              categoryId: note.category_id ?? null,
                              origin: "server-reconcile",
                          },
                      )
                    : null;
                await transaction.run(
                    `UPDATE local_notes
                     SET title = $title,
                         content = $content,
                         category_id = $categoryId,
                         created_at = $createdAt,
                         is_pinned = $isPinned,
                         is_starred = $isStarred,
                         local_order = $localOrder,
                         pinned_order = $pinnedOrder,
                         current_revision_id = COALESCE(
                             $revisionId,
                             current_revision_id
                         ),
                         local_updated_at = $localUpdatedAt
                     WHERE local_id = $localId`,
                    {
                        $title: note.title,
                        $content: note.content,
                        $categoryId: note.category_id,
                        $createdAt: note.created_at,
                        $isPinned: note.is_pinned ? 1 : 0,
                        $isStarred: note.is_starred ? 1 : 0,
                        $localOrder: note.local_order ?? index,
                        $pinnedOrder: note.pinned_order ?? null,
                        $revisionId: revisionId,
                        $localUpdatedAt: new Date().toISOString(),
                        $localId: existing.local_id,
                    },
                );
                continue;
            }

            const insertedRevisionId = await insertNoteRevision(
                transaction,
                ownerUserId,
                serverId,
                {
                    parentId: null,
                    title: note.title,
                    content: note.content,
                    categoryId: note.category_id ?? null,
                    origin: "server-reconcile",
                },
            );
            await transaction.run(
                `INSERT INTO local_notes (
                    owner_user_id,
                    client_id,
                    server_id,
                    title,
                    content,
                    category_id,
                    created_at,
                    is_pinned,
                    is_starred,
                    local_order,
                    pinned_order,
                    sync_status,
                    sync_operation,
                    local_updated_at,
                    current_revision_id
                 ) VALUES (
                    $ownerUserId,
                    $clientId,
                    $serverId,
                    $title,
                    $content,
                    $categoryId,
                    $createdAt,
                    $isPinned,
                    $isStarred,
                    $localOrder,
                    $pinnedOrder,
                    'synced',
                    NULL,
                    $localUpdatedAt,
                    $revisionId
                 )`,
                {
                    $ownerUserId: ownerUserId,
                    $clientId: serverId,
                    $serverId: serverId,
                    $title: note.title,
                    $content: note.content,
                    $categoryId: note.category_id,
                    $createdAt: note.created_at,
                    $isPinned: note.is_pinned ? 1 : 0,
                    $isStarred: note.is_starred ? 1 : 0,
                    $localOrder: note.local_order ?? index,
                    $pinnedOrder: note.pinned_order ?? null,
                    $localUpdatedAt: new Date().toISOString(),
                    $revisionId: insertedRevisionId,
                },
            );
            added++;
        }

        const syncedRows = await transaction.getAll<LocalNoteRow>(
            `SELECT ${LOCAL_NOTE_COLUMNS}
             FROM local_notes
             WHERE owner_user_id = $ownerUserId AND sync_status = 'synced'`,
            { $ownerUserId: ownerUserId },
        );
        for (const row of syncedRows) {
            if (row.server_id != null && !serverIds.has(row.server_id)) {
                // 服务器删除传播：版本随笔记清理，未提交草稿仍保留。
                await deleteNoteRevisions(transaction, ownerUserId, row.client_id);
                await transaction.run(
                    "DELETE FROM local_notes WHERE local_id = $localId",
                    { $localId: row.local_id },
                );
            }
        }
        return added;
    });

    const notes = await getLocalNotes(database, ownerUserId);
    onReconciled?.({ addedCount });
    return notes;
}

/**
 * 从旧版本内容创建新的当前版本；旧节点保持不变（origin=restore）。
 * 内容写回 local_notes 并置 pending 等待云端同步。
 */
export async function restoreLocalNoteToRevision(
    database: ApplicationDatabase,
    ownerUserId: number,
    clientId: number,
    revisionId: string,
) {
    return database.transaction(async (tx) => {
        const revision = await getNoteRevisionById(tx, ownerUserId, revisionId);
        if (!revision || revision.client_id !== clientId) {
            throw new Error("[Note revision] 目标版本不存在或不属于这篇笔记");
        }
        const existing = await readNoteByClientId(tx, ownerUserId, clientId);
        if (!existing) {
            throw new Error("[Note revision] 笔记不存在，无法恢复版本");
        }
        const current = await getCurrentNoteRevision(tx, ownerUserId, clientId);
        if (current?.revision_id === revision.revision_id) {
            throw new Error("[Note revision] 该版本已是当前内容");
        }

        const nextRevisionId = await insertNoteRevision(tx, ownerUserId, clientId, {
            parentId: current?.revision_id ?? null,
            title: revision.title,
            content: revision.content,
            categoryId: revision.category_id,
            origin: "restore",
        });
        const operation: NoteSyncOperation =
            existing.sync_operation === "create" || existing.server_id == null
                ? "create"
                : "update";
        await tx.run(
            `UPDATE local_notes
             SET title = $title,
                 content = $content,
                 category_id = $categoryId,
                 current_revision_id = $revisionId,
                 sync_status = 'pending',
                 sync_operation = $syncOperation,
                 last_sync_error = NULL,
                 local_updated_at = $localUpdatedAt
             WHERE owner_user_id = $ownerUserId AND client_id = $clientId`,
            {
                $title: revision.title,
                $content: revision.content,
                $categoryId: revision.category_id,
                $revisionId: nextRevisionId,
                $syncOperation: operation,
                $localUpdatedAt: new Date().toISOString(),
                $ownerUserId: ownerUserId,
                $clientId: clientId,
            },
        );

        const note = await readNoteByClientId(tx, ownerUserId, clientId);
        if (!note) {
            throw new Error("[Note revision] 恢复后无法重新读取笔记");
        }
        return note;
    });
}

export type NoteQueueRollbackAvailability =
    | { allowed: true }
    | { allowed: false; reason: string };

/** 删除暂存任务前的只读检查；版本指针不匹配时禁止覆盖更新后的内容。 */
export async function getNoteQueueRollbackAvailability(
    database: ApplicationDatabase,
    ownerUserId: number,
    clientId: number,
    expectedRevisionId: string,
): Promise<NoteQueueRollbackAvailability> {
    const current = await getCurrentNoteRevision(
        database,
        ownerUserId,
        clientId,
    );
    if (!current) {
        return { allowed: false, reason: "笔记没有可回滚的本地版本" };
    }
    if (current.revision_id !== expectedRevisionId) {
        return { allowed: false, reason: "笔记内容已变化，请等待队列刷新" };
    }
    if (!current.parent_revision_id) {
        return { allowed: false, reason: "没有上一个版本，无法回滚" };
    }
    return { allowed: true };
}

/**
 * 在调用方事务内回滚队列对应的当前版本。
 * 当前版本不会删除，而是以其为父节点创建 origin=restore 的新版本。
 */
export async function rollbackQueuedLocalNoteToPreviousRevision(
    transaction: ApplicationDatabaseTransaction,
    ownerUserId: number,
    clientId: number,
    expectedRevisionId: string,
    uploadAttempted: boolean,
) {
    const existing = await readNoteByClientId(
        transaction,
        ownerUserId,
        clientId,
    );
    if (!existing) {
        throw new Error("[Note rollback] 本地笔记不存在，无法回滚");
    }

    const current = await getCurrentNoteRevision(
        transaction,
        ownerUserId,
        clientId,
    );
    if (!current || current.revision_id !== expectedRevisionId) {
        throw new Error("[Note rollback] 笔记内容已变化，请刷新后重试");
    }
    if (!current.parent_revision_id) {
        throw new Error("[Note rollback] 没有上一个版本，无法回滚");
    }

    const previous = await getNoteRevisionById(
        transaction,
        ownerUserId,
        current.parent_revision_id,
    );
    if (!previous || previous.client_id !== clientId) {
        throw new Error("[Note rollback] 上一个版本不存在或不属于这篇笔记");
    }

    const nextRevisionId = await insertNoteRevision(
        transaction,
        ownerUserId,
        clientId,
        {
            parentId: current.revision_id,
            title: previous.title,
            content: previous.content,
            categoryId: previous.category_id,
            origin: "restore",
        },
    );
    const hasServerCopy = existing.server_id != null;
    const syncStatus: NoteSyncStatus = uploadAttempted
        ? "unknown"
        : hasServerCopy
          ? "synced"
          : "pending";
    const syncOperation: NoteSyncOperation | null =
        syncStatus === "synced"
            ? null
            : hasServerCopy
              ? "update"
              : "create";
    const lastSyncError = uploadAttempted
        ? "已取消自动上传；云端接收状态未知，请在笔记页核对后同步。"
        : hasServerCopy
          ? null
          : "已取消自动上传；本地笔记尚未同步，可在笔记页重新同步。";

    await transaction.run(
        `UPDATE local_notes
         SET title = $title,
             content = $content,
             category_id = $categoryId,
             current_revision_id = $revisionId,
             sync_status = $syncStatus,
             sync_operation = $syncOperation,
             last_sync_error = $lastSyncError,
             local_updated_at = $localUpdatedAt
         WHERE owner_user_id = $ownerUserId AND client_id = $clientId`,
        {
            $title: previous.title,
            $content: previous.content,
            $categoryId: previous.category_id,
            $revisionId: nextRevisionId,
            $syncStatus: syncStatus,
            $syncOperation: syncOperation,
            $lastSyncError: lastSyncError,
            $localUpdatedAt: new Date().toISOString(),
            $ownerUserId: ownerUserId,
            $clientId: clientId,
        },
    );

    const note = await readNoteByClientId(
        transaction,
        ownerUserId,
        clientId,
    );
    if (!note) throw new Error("[Note rollback] 回滚后无法重新读取笔记");
    return note;
}

export async function removeLocalNote(
    database: ApplicationDatabase,
    ownerUserId: number,
    clientId: number,
) {
    await database.transaction(async (tx) => {
        await deleteNoteRevisions(tx, ownerUserId, clientId);
        await tx.run(
            `DELETE FROM local_notes
             WHERE owner_user_id = $ownerUserId AND client_id = $clientId`,
            { $ownerUserId: ownerUserId, $clientId: clientId },
        );
    });
}

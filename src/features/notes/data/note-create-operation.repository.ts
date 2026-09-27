import type {
    ApplicationDatabase,
    ApplicationDatabaseTransaction as Tx,
} from "@/core/database";
import type { CreateNotePayload, Note } from "../notes.types";

export type NoteCreateRequest = CreateNotePayload & { client_id: string };

/** 首次发送前固定的新建请求：重试必须原样发送，服务端才能按幂等键去重。 */
export type NoteCreateOperation = {
    operationId: string;
    cloudId: string;
    /** 固定请求体对应的本地版本；确认后据此判断本机是否又有新修改。 */
    revisionId: string | null;
    request: NoteCreateRequest;
};

type OperationRow = {
    operation_id: string;
    cloud_id: string;
    revision_id: string | null;
    request_json: string;
};

const UUID = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** 与待办相同的 UUID 生成方式；有系统随机 UUID 时优先使用。 */
function newUuid(): string {
    return (
        globalThis.crypto?.randomUUID?.() ??
        "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
            const value = Math.floor(Math.random() * 16);
            return (char === "x" ? value : (value & 3) | 8).toString(16);
        })
    );
}

/** 旧结构数据库（如只建到部分迁移的诊断库）没有这张表时，按旧协议新建。 */
async function available(db: Tx) {
    return Boolean(
        await db.getFirst(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='note_create_operations'",
        ),
    );
}

function parse(row: OperationRow): NoteCreateOperation {
    const request: unknown = JSON.parse(row.request_json);
    if (
        !UUID.test(row.operation_id) ||
        !UUID.test(row.cloud_id) ||
        !request ||
        typeof request !== "object" ||
        (request as { client_id?: unknown }).client_id !== row.cloud_id ||
        typeof (request as { title?: unknown }).title !== "string" ||
        typeof (request as { content?: unknown }).content !== "string"
    ) {
        throw new Error("新建请求记录损坏，已保留本地笔记");
    }
    return {
        operationId: row.operation_id,
        cloudId: row.cloud_id,
        revisionId: row.revision_id,
        request: request as NoteCreateRequest,
    };
}

export async function readNoteCreateOperation(
    db: Tx,
    owner: number,
    clientId: number,
): Promise<NoteCreateOperation | null> {
    if (!(await available(db))) return null;
    const row = await db.getFirst<OperationRow>(
        `SELECT operation_id,cloud_id,revision_id,request_json FROM note_create_operations
         WHERE owner_user_id=? AND client_id=?`,
        [owner, clientId],
    );
    return row ? parse(row) : null;
}

/**
 * 取出已固定的新建请求；没有时按当前笔记固定一份。旧结构数据库返回 null（不带幂等键新建）。
 * `payload` 必须由 `note` 生成，二者对应同一本地版本。
 */
export async function prepareNoteCreateOperation(
    db: ApplicationDatabase,
    owner: number,
    note: Note,
    payload: CreateNotePayload,
): Promise<NoteCreateOperation | null> {
    return db.transaction(async (tx) => {
        if (!(await available(tx))) return null;
        const existing = await readNoteCreateOperation(tx, owner, note.id);
        if (existing) return existing;
        const cloudId = newUuid();
        const operation: NoteCreateOperation = {
            operationId: newUuid(),
            cloudId,
            revisionId: note.current_revision_id ?? null,
            request: { ...payload, client_id: cloudId },
        };
        await tx.run(
            `INSERT INTO note_create_operations
             (owner_user_id,client_id,operation_id,cloud_id,revision_id,request_json,created_at)
             VALUES(?,?,?,?,?,?,?)`,
            [
                owner,
                note.id,
                operation.operationId,
                cloudId,
                operation.revisionId,
                JSON.stringify(operation.request),
                new Date().toISOString(),
            ],
        );
        return operation;
    });
}

/** 指定 operationId 时只删除这一次请求，不误删之后重新固定的请求。 */
export async function deleteNoteCreateOperation(
    db: Tx,
    owner: number,
    clientId: number,
    operationId?: string,
) {
    if (!(await available(db))) return;
    await db.run(
        `DELETE FROM note_create_operations WHERE owner_user_id=? AND client_id=?${
            operationId === undefined ? "" : " AND operation_id=?"
        }`,
        operationId === undefined
            ? [owner, clientId]
            : [owner, clientId, operationId],
    );
}

/**
 * 云端已按固定请求建出笔记、本机却没收到响应时，同步镜像里会出现同一云端身份的笔记。
 * 把它认领给本机笔记，避免列表里出现两份；正在上传的笔记留给那次请求自己确认。
 * 认领后本机版本仍是固定时的版本即为已同步，否则转为待更新；被阻塞的上传任务恢复排队。
 */
export async function linkCreatedNotes(tx: Tx, owner: number) {
    if (!(await available(tx))) return 0;
    const rows = await tx.getAll<{
        client_id: number;
        revision_id: string | null;
        current_revision_id: string | null;
        server_id: number;
        payload: string;
    }>(
        `SELECT o.client_id,o.revision_id,n.current_revision_id,m.server_id,m.payload
         FROM note_create_operations o
         JOIN note_sync_mirror m ON m.owner_user_id=o.owner_user_id AND m.cloud_id=o.cloud_id
         JOIN local_notes n ON n.owner_user_id=o.owner_user_id AND n.client_id=o.client_id
         WHERE o.owner_user_id=? AND m.payload IS NOT NULL AND n.server_id IS NULL AND n.sync_status!='syncing'
         AND NOT EXISTS (SELECT 1 FROM local_notes x WHERE x.owner_user_id=o.owner_user_id AND x.server_id=m.server_id)`,
        [owner],
    );
    const now = new Date().toISOString();
    for (const row of rows) {
        const cloud: unknown = JSON.parse(row.payload);
        const cloudUpdatedAt =
            cloud &&
            typeof cloud === "object" &&
            typeof (cloud as { updated_at?: unknown }).updated_at === "string"
                ? (cloud as { updated_at: string }).updated_at
                : null;
        const current = row.current_revision_id === row.revision_id;
        await tx.run(
            `UPDATE local_notes SET server_id=?, sync_status=?, sync_operation=?, last_sync_error=NULL,
             server_updated_at=CASE WHEN ? THEN ? ELSE server_updated_at END,
             local_updated_at=CASE WHEN ? THEN COALESCE(?, local_updated_at) ELSE local_updated_at END
             WHERE owner_user_id=? AND client_id=?`,
            [
                row.server_id,
                current ? "synced" : "pending",
                current ? null : "update",
                current ? 1 : 0,
                cloudUpdatedAt,
                current ? 1 : 0,
                cloudUpdatedAt,
                owner,
                row.client_id,
            ],
        );
        await tx.run(
            "DELETE FROM note_create_operations WHERE owner_user_id=? AND client_id=?",
            [owner, row.client_id],
        );
        await tx.run(
            `UPDATE upload_queue_tasks SET status='queued', attempt_count=0, last_error=NULL, updated_at=?
             WHERE owner_user_id=? AND dedupe_key=? AND status='blocked'`,
            [now, owner, `note:${row.client_id}`],
        );
    }
    return rows.length;
}

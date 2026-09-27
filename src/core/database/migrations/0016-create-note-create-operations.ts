import type { DatabaseMigration } from "../database.types";

/**
 * 新建笔记的幂等请求：首次发送前固定幂等键、云端身份与请求体，重试原样重发。
 * 行只存在于新建尚未确认的期间；云端确认、明确拒绝或笔记删除后清除。
 */
export const createNoteCreateOperations: DatabaseMigration = {
    version: 16,
    name: "create_note_create_operations",
    async up(database) {
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS note_create_operations (
                owner_user_id INTEGER NOT NULL,
                client_id INTEGER NOT NULL,
                operation_id TEXT NOT NULL CHECK (length(operation_id) = 36),
                cloud_id TEXT NOT NULL CHECK (length(cloud_id) = 36),
                revision_id TEXT,
                request_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (owner_user_id, client_id),
                UNIQUE (owner_user_id, operation_id),
                UNIQUE (owner_user_id, cloud_id)
            );
        `);
    },
};

import type { DatabaseMigration } from "../database.types";

export const createUploadQueue: DatabaseMigration = {
    version: 5,
    name: "create_upload_queue",
    async up(database) {
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS upload_queue_tasks (
                task_id TEXT PRIMARY KEY,
                owner_user_id INTEGER NOT NULL,
                task_kind TEXT NOT NULL,
                dedupe_key TEXT NOT NULL,
                title TEXT NOT NULL,
                operation_label TEXT NOT NULL,
                payload_json TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'running', 'paused', 'blocked')),
                attempt_count INTEGER NOT NULL DEFAULT 0,
                estimated_bytes INTEGER NOT NULL DEFAULT 0,
                transferred_bytes INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE (owner_user_id, dedupe_key)
            );

            CREATE INDEX IF NOT EXISTS upload_queue_owner_status_idx
                ON upload_queue_tasks (owner_user_id, status, created_at);
        `);
    },
};

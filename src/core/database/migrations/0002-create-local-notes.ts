import type { DatabaseMigration } from "../database.types";

export const createLocalNotes: DatabaseMigration = {
    version: 2,
    name: "create_local_notes",
    async up(database) {
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS local_notes (
                local_id INTEGER PRIMARY KEY AUTOINCREMENT,
                owner_user_id INTEGER NOT NULL,
                client_id INTEGER,
                server_id INTEGER,
                title TEXT NOT NULL,
                content TEXT,
                category_id INTEGER,
                created_at TEXT NOT NULL,
                is_pinned INTEGER NOT NULL DEFAULT 0,
                is_starred INTEGER NOT NULL DEFAULT 0,
                local_order INTEGER,
                pinned_order INTEGER,
                sync_status TEXT NOT NULL DEFAULT 'pending'
                    CHECK (sync_status IN ('pending', 'syncing', 'synced', 'rejected', 'unknown')),
                sync_operation TEXT
                    CHECK (sync_operation IN ('create', 'update') OR sync_operation IS NULL),
                last_sync_error TEXT,
                local_updated_at TEXT NOT NULL,
                UNIQUE (owner_user_id, client_id),
                UNIQUE (owner_user_id, server_id)
            );

            CREATE INDEX IF NOT EXISTS local_notes_owner_updated_idx
                ON local_notes (owner_user_id, local_updated_at DESC);

            CREATE INDEX IF NOT EXISTS local_notes_owner_sync_idx
                ON local_notes (owner_user_id, sync_status, sync_operation);
        `);
    },
};

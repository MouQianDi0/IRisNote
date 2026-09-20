import type { DatabaseMigration } from "../database.types";

export const addNoteSyncState: DatabaseMigration = {
    version: 7,
    name: "add_note_sync_state",
    async up(database) {
        await database.execAsync(`
            CREATE TABLE note_sync_state (
                owner_user_id INTEGER PRIMARY KEY,
                changes_cursor TEXT,
                snapshot_token TEXT,
                snapshot_cursor TEXT,
                snapshot_changes_cursor TEXT,
                completed_at TEXT
            );
            CREATE TABLE note_sync_mirror (
                owner_user_id INTEGER NOT NULL,
                server_id INTEGER NOT NULL,
                cloud_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                payload TEXT,
                PRIMARY KEY (owner_user_id, server_id),
                UNIQUE (owner_user_id, cloud_id)
            );
            CREATE TABLE note_sync_snapshot (
                owner_user_id INTEGER NOT NULL,
                server_id INTEGER NOT NULL,
                cloud_id TEXT NOT NULL,
                version INTEGER NOT NULL,
                payload TEXT NOT NULL,
                PRIMARY KEY (owner_user_id, server_id),
                UNIQUE (owner_user_id, cloud_id)
            );
        `);
    },
};

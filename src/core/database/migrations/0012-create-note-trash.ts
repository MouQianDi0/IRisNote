import type { DatabaseMigration } from "../database.types";

export const createNoteTrash: DatabaseMigration = {
    version: 12,
    name: "create_note_trash",
    async up(database) {
        await database.execAsync(`
            CREATE TABLE note_trash (
                owner_user_id INTEGER NOT NULL,
                client_id INTEGER NOT NULL,
                server_id INTEGER,
                cloud_id TEXT,
                version INTEGER NOT NULL DEFAULT 0,
                deleted_at TEXT,
                expires_at TEXT,
                state TEXT NOT NULL CHECK(state IN ('local','deleting','deleted','unresolved')),
                local_json TEXT,
                cloud_json TEXT,
                drafts_json TEXT,
                last_error TEXT,
                PRIMARY KEY(owner_user_id,client_id),
                UNIQUE(owner_user_id,server_id)
            );
            CREATE INDEX note_trash_expiry ON note_trash(owner_user_id,expires_at);
            CREATE TABLE note_trash_clock (
                owner_user_id INTEGER PRIMARY KEY,
                offset_ms INTEGER NOT NULL
            );
        `);
    },
};

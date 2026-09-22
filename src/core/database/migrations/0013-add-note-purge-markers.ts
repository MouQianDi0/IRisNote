import type { DatabaseMigration } from "../database.types";

/** v12 is already committed; use a new version so existing v12 installations also receive the guard. */
export const addNotePurgeMarkers: DatabaseMigration = {
    version: 13,
    name: "add_note_purge_markers",
    async up(database) {
        await database.execAsync(`
            CREATE TABLE note_trash_purged (
                owner_user_id INTEGER NOT NULL,
                client_id INTEGER NOT NULL,
                server_id INTEGER,
                cloud_id TEXT,
                PRIMARY KEY(owner_user_id,client_id),
                UNIQUE(owner_user_id,server_id)
            );
        `);
    },
};

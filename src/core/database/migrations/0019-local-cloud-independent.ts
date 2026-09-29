import type { DatabaseMigration } from "../database.types";

export const localCloudIndependent: DatabaseMigration = {
    version: 19,
    name: "local_cloud_independent",
    async up(db) {
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS local_categories (
                owner_user_id INTEGER NOT NULL, id INTEGER NOT NULL,
                server_id INTEGER, name TEXT NOT NULL, icon TEXT NOT NULL,
                is_pinned INTEGER NOT NULL DEFAULT 0, is_starred INTEGER NOT NULL DEFAULT 0,
                version INTEGER NOT NULL DEFAULT 1, dirty INTEGER NOT NULL DEFAULT 0,
                deleted INTEGER NOT NULL DEFAULT 0, create_started INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY(owner_user_id,id), UNIQUE(owner_user_id,server_id)
            );
            CREATE TABLE IF NOT EXISTS note_local_flags (
                owner_user_id INTEGER NOT NULL, client_id INTEGER NOT NULL,
                is_pinned INTEGER, is_starred INTEGER, version INTEGER NOT NULL DEFAULT 1,
                PRIMARY KEY(owner_user_id,client_id)
            );
            CREATE TABLE IF NOT EXISTS note_trash_intents (
                owner_user_id INTEGER NOT NULL, client_id INTEGER NOT NULL,
                intent TEXT NOT NULL CHECK(intent IN ('delete','restore')),
                receipt_json TEXT NOT NULL,
                PRIMARY KEY(owner_user_id,client_id)
            );
            CREATE TRIGGER IF NOT EXISTS preserve_pending_note_flags
            AFTER UPDATE OF is_pinned,is_starred ON local_notes
            WHEN EXISTS(SELECT 1 FROM note_local_flags f WHERE f.owner_user_id=NEW.owner_user_id
                AND f.client_id=NEW.client_id AND
                (COALESCE(f.is_pinned,NEW.is_pinned)<>NEW.is_pinned OR
                 COALESCE(f.is_starred,NEW.is_starred)<>NEW.is_starred))
            BEGIN
                UPDATE local_notes SET
                    is_pinned=COALESCE((SELECT is_pinned FROM note_local_flags WHERE owner_user_id=NEW.owner_user_id AND client_id=NEW.client_id),is_pinned),
                    is_starred=COALESCE((SELECT is_starred FROM note_local_flags WHERE owner_user_id=NEW.owner_user_id AND client_id=NEW.client_id),is_starred)
                WHERE owner_user_id=NEW.owner_user_id AND client_id=NEW.client_id;
            END;
        `);
    },
};

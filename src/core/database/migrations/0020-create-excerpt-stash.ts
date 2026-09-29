import type { DatabaseMigration } from "../database.types";

export const createExcerptStash: DatabaseMigration = {
    version: 20,
    name: "create_excerpt_stash",
    async up(db) {
        await db.execAsync(`
            CREATE TABLE IF NOT EXISTS local_excerpt_stash (
                owner_key TEXT NOT NULL CHECK(length(owner_key) > 0),
                client_id TEXT NOT NULL CHECK(length(client_id) = 36),
                content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 20000),
                content_hash TEXT NOT NULL CHECK(length(content_hash) = 64),
                local_order INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (owner_key, client_id)
            );
            CREATE UNIQUE INDEX IF NOT EXISTS idx_local_excerpt_stash_owner_hash
              ON local_excerpt_stash(owner_key, content_hash);
        `);
    },
};

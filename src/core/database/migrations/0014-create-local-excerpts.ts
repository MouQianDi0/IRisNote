import type { DatabaseMigration } from "../database.types";

export const createLocalExcerpts: DatabaseMigration = {
    version: 14,
    name: "create_local_excerpts",
    async up(database) {
        await database.execAsync(`
      CREATE TABLE IF NOT EXISTS local_excerpts (
        owner_key TEXT NOT NULL CHECK(length(owner_key) > 0),
        client_id TEXT NOT NULL CHECK(length(client_id) = 36),
        content TEXT NOT NULL CHECK(length(content) BETWEEN 1 AND 20000),
        content_hash TEXT NOT NULL CHECK(length(content_hash) = 64),
        source TEXT NOT NULL CHECK(source IN ('paste', 'auto', 'manual')),
        is_pinned INTEGER NOT NULL CHECK(is_pinned IN (0, 1)),
        local_version INTEGER NOT NULL CHECK(typeof(local_version) = 'integer' AND local_version >= 1),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_key, client_id)
      );
      CREATE INDEX IF NOT EXISTS idx_local_excerpts_owner_updated ON local_excerpts(owner_key, updated_at);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_local_excerpts_owner_hash ON local_excerpts(owner_key, content_hash);
    `);
    },
};

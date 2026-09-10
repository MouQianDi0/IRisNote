import type { DatabaseMigration } from "../database.types";

export const createMigrationLedger: DatabaseMigration = {
    version: 1,
    name: "create_migration_ledger",
    async up(database) {
        await database.execAsync(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                version INTEGER PRIMARY KEY NOT NULL,
                name TEXT NOT NULL UNIQUE,
                applied_at TEXT NOT NULL
            );
        `);
    },
};

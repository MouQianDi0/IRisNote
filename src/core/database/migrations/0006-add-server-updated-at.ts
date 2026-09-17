import type { DatabaseMigration } from "../database.types";

export const addServerUpdatedAt: DatabaseMigration = {
    version: 6,
    name: "add_server_updated_at",
    async up(database) {
        const columns = await database.getAllAsync<{ name: string }>(
            "PRAGMA table_info(local_notes)",
        );

        if (!columns.some((column) => column.name === "server_updated_at")) {
            await database.execAsync(
                "ALTER TABLE local_notes ADD COLUMN server_updated_at TEXT",
            );
        }
    },
};

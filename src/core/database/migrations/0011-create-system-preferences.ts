import type { DatabaseMigration } from "../database.types";

export const createSystemPreferences: DatabaseMigration = {
  version: 11,
  name: "create_system_preferences",
  async up(database) {
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS system_preferences (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  },
};

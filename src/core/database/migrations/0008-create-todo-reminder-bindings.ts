import type { DatabaseMigration } from "../database.types";

export const createTodoReminderBindings: DatabaseMigration = {
  version: 8,
  name: "create_todo_reminder_bindings",
  async up(database) {
    // No FK cascade: deleted todos must leave cancellation work durable.
    await database.execAsync(`
      CREATE TABLE IF NOT EXISTS todo_reminder_bindings (
        owner_key TEXT NOT NULL,
        todo_id TEXT NOT NULL,
        notification_id TEXT NOT NULL UNIQUE,
        todo_version INTEGER NOT NULL CHECK(todo_version >= 1),
        trigger_at INTEGER,
        state TEXT NOT NULL CHECK(state IN ('schedule', 'scheduled', 'cancel', 'error')),
        last_error TEXT,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(owner_key, todo_id)
      );
    `);
  },
};

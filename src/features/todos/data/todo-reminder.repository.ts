import type { ApplicationDatabase } from "@/core/database/database.types";

export type TodoReminderBinding = {
    owner_key: string;
    todo_id: string;
    notification_id: string;
    todo_version: number;
    trigger_at: number | null;
    state: "schedule" | "scheduled" | "cancel" | "error";
    last_error: string | null;
    updated_at: string;
};

export class TodoReminderRepository {
    constructor(private readonly database: ApplicationDatabase) {}
    list() {
        return this.database.getAll<TodoReminderBinding>(
            "SELECT * FROM todo_reminder_bindings",
        );
    }
    async put(binding: TodoReminderBinding) {
        await this.database.run(
            `INSERT INTO todo_reminder_bindings
      (owner_key, todo_id, notification_id, todo_version, trigger_at, state, last_error, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(owner_key, todo_id) DO UPDATE SET notification_id=excluded.notification_id,
      todo_version=excluded.todo_version, trigger_at=excluded.trigger_at, state=excluded.state,
      last_error=excluded.last_error, updated_at=excluded.updated_at`,
            [
                binding.owner_key,
                binding.todo_id,
                binding.notification_id,
                binding.todo_version,
                binding.trigger_at,
                binding.state,
                binding.last_error,
                binding.updated_at,
            ],
        );
    }
    async remove(binding: TodoReminderBinding) {
        await this.database.run(
            "DELETE FROM todo_reminder_bindings WHERE owner_key=? AND todo_id=?",
            [binding.owner_key, binding.todo_id],
        );
    }
}

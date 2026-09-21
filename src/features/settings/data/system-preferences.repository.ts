import type { ApplicationDatabase } from "@/core/database/database.types";

const RUNTIME_NOTIFICATION_KEY = "persistent_notification_enabled";

type PreferenceRow = { value: string };

export class SystemPreferencesRepository {
  constructor(private readonly database: ApplicationDatabase) {}

  async runtimeNotificationEnabled() {
    const row = await this.database.getFirst<PreferenceRow>(
      "SELECT value FROM system_preferences WHERE key = ?",
      [RUNTIME_NOTIFICATION_KEY],
    );
    return row?.value === "1";
  }

  async setRuntimeNotificationEnabled(enabled: boolean) {
    await this.database.run(
      `INSERT INTO system_preferences (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      [RUNTIME_NOTIFICATION_KEY, enabled ? "1" : "0", new Date().toISOString()],
    );
  }
}

import type { ApplicationDatabase } from "@/core/database/database.types";

const RUNTIME_NOTIFICATION_KEY = "persistent_notification_enabled";
const EXACT_ALARM_ACCESS_KEY = "exact_alarm_access";

export type StoredExactAlarmAccess = "not-required" | "granted" | "denied";

type PreferenceRow = { value: string };

export class SystemPreferencesRepository {
    constructor(private readonly database: ApplicationDatabase) {}

    async cloudStorageConsent(ownerUserId: number) {
        const row = await this.database.getFirst<PreferenceRow>(
            "SELECT value FROM system_preferences WHERE key = ?",
            [`cloud_storage_consent:user:${ownerUserId}`],
        );
        return row?.value === "1";
    }

    async setCloudStorageConsent(ownerUserId: number, enabled: boolean) {
        await this.database.run(
            `INSERT INTO system_preferences (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            [
                `cloud_storage_consent:user:${ownerUserId}`,
                enabled ? "1" : "0",
                new Date().toISOString(),
            ],
        );
    }

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
            [
                RUNTIME_NOTIFICATION_KEY,
                enabled ? "1" : "0",
                new Date().toISOString(),
            ],
        );
    }

    async exactAlarmAccess(): Promise<StoredExactAlarmAccess | null> {
        const row = await this.database.getFirst<PreferenceRow>(
            "SELECT value FROM system_preferences WHERE key = ?",
            [EXACT_ALARM_ACCESS_KEY],
        );
        return row?.value === "not-required" ||
            row?.value === "granted" ||
            row?.value === "denied"
            ? row.value
            : null;
    }

    async setExactAlarmAccess(status: StoredExactAlarmAccess) {
        await this.database.run(
            `INSERT INTO system_preferences (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            [EXACT_ALARM_ACCESS_KEY, status, new Date().toISOString()],
        );
    }
}

import type { ApplicationDatabase } from "@/core/database/database.types";

const RUNTIME_NOTIFICATION_KEY = "persistent_notification_enabled";
const EXACT_ALARM_ACCESS_KEY = "exact_alarm_access";
const LIVE_TODO_REALTIME_KEY = "live_todo_realtime_enabled";
const CLIPBOARD_AUTO_DETECT_KEY = "clipboard_auto_detect_enabled";
const CLIPBOARD_HINT_DISMISSED_KEY = "clipboard_hint_dismissed";
/** 旧版存的是不带密钥的内容哈希，短验证码可被枚举还原；写入新标记时删除。 */
const CLIPBOARD_LEGACY_HANDLED_HASH_KEY = "clipboard_last_handled_hash";
const CLIPBOARD_LAST_HANDLED_MARK_KEY = "clipboard_last_handled_mark";

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

    /** 方案 B 开关：待办进行中卡片退后台由前台服务秒级刷新。 */
    async liveTodoRealtimeEnabled(): Promise<boolean> {
        const row = await this.database.getFirst<PreferenceRow>(
            "SELECT value FROM system_preferences WHERE key = ?",
            [LIVE_TODO_REALTIME_KEY],
        );
        return row?.value === "1";
    }

    async setLiveTodoRealtimeEnabled(enabled: boolean) {
        await this.database.run(
            `INSERT INTO system_preferences (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            [
                LIVE_TODO_REALTIME_KEY,
                enabled ? "1" : "0",
                new Date().toISOString(),
            ],
        );
    }

    /** 剪贴板自动检测为设备级开关，默认关闭，不随账号切换。 */
    async clipboardAutoDetectEnabled(): Promise<boolean> {
        return (await this.read(CLIPBOARD_AUTO_DETECT_KEY)) === "1";
    }

    async setClipboardAutoDetectEnabled(enabled: boolean) {
        await this.write(CLIPBOARD_AUTO_DETECT_KEY, enabled ? "1" : "0");
    }

    async clipboardHintDismissed(): Promise<boolean> {
        return (await this.read(CLIPBOARD_HINT_DISMISSED_KEY)) === "1";
    }

    async setClipboardHintDismissed() {
        await this.write(CLIPBOARD_HINT_DISMISSED_KEY, "1");
    }

    /** 最近一次已提示或已处理的剪贴板内容标记（带密钥的摘要，不存原文）。 */
    async clipboardLastHandledMark(): Promise<string | null> {
        const value = await this.read(CLIPBOARD_LAST_HANDLED_MARK_KEY);
        return value && /^[0-9a-f]{64}$/.test(value) ? value : null;
    }

    async setClipboardLastHandledMark(mark: string) {
        await this.write(CLIPBOARD_LAST_HANDLED_MARK_KEY, mark);
        await this.clearLegacyClipboardHash();
    }

    async clearLegacyClipboardHash() {
        await this.database.run("DELETE FROM system_preferences WHERE key = ?", [
            CLIPBOARD_LEGACY_HANDLED_HASH_KEY,
        ]);
    }

    private async read(key: string) {
        const row = await this.database.getFirst<PreferenceRow>(
            "SELECT value FROM system_preferences WHERE key = ?",
            [key],
        );
        return row?.value ?? null;
    }

    private async write(key: string, value: string) {
        await this.database.run(
            `INSERT INTO system_preferences (key, value, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
            [key, value, new Date().toISOString()],
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

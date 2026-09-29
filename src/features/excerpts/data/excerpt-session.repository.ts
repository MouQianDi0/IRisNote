import type { ApplicationDatabase } from "@/core/database/database.types";
import {
    isSessionDuration,
    parseExcerptSession,
    type ExcerptSession,
} from "../domain/excerpt-session";

export class ExcerptSessionRepository {
    constructor(private readonly database: ApplicationDatabase) {}

    async read() {
        const rows = await this.database.getAll<{ key: string; value: string }>(
            "SELECT key, value FROM system_preferences WHERE key IN (?, ?)",
            ["excerpt_session", "excerpt_session_last_duration"],
        );
        const raw =
            rows.find((row) => row.key === "excerpt_session")?.value ?? null;
        const duration = Number(
            rows.find((row) => row.key === "excerpt_session_last_duration")
                ?.value,
        );
        return {
            session: parseExcerptSession(raw),
            lastDuration: isSessionDuration(duration) ? duration : 30,
        } as const;
    }

    async save(session: ExcerptSession) {
        await this.database.transaction(async (transaction) => {
            for (const [key, value] of [
                ["excerpt_session", JSON.stringify(session)],
                [
                    "excerpt_session_last_duration",
                    String(session.durationMinutes),
                ],
            ]) {
                await transaction.run(
                    `INSERT INTO system_preferences (key, value, updated_at) VALUES (?, ?, ?)
                     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
                    [key, value, new Date().toISOString()],
                );
            }
        });
    }

    async clear() {
        await this.database.run(
            "DELETE FROM system_preferences WHERE key = ?",
            ["excerpt_session"],
        );
    }
}

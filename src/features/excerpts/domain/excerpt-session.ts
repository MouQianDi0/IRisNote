export const EXCERPT_SESSION_DURATIONS = [15, 30, 60, 120] as const;
export type ExcerptSessionDuration = (typeof EXCERPT_SESSION_DURATIONS)[number];
export type ExcerptSession = {
    sessionId: string;
    ownerKey: string;
    startedAt: number;
    endsAt: number;
    durationMinutes: ExcerptSessionDuration;
};

export function isSessionDuration(
    value: unknown,
): value is ExcerptSessionDuration {
    return EXCERPT_SESSION_DURATIONS.some((duration) => duration === value);
}

/** 持久状态不可信：拒绝损坏、无限期或被延长的会话。 */
export function parseExcerptSession(raw: string | null): ExcerptSession | null {
    if (!raw) return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (!value || typeof value !== "object") return null;
        const item = value as Record<string, unknown>;
        if (
            typeof item.sessionId !== "string" ||
            !item.sessionId ||
            typeof item.ownerKey !== "string" ||
            !item.ownerKey ||
            typeof item.startedAt !== "number" ||
            !Number.isSafeInteger(item.startedAt) ||
            typeof item.endsAt !== "number" ||
            !Number.isSafeInteger(item.endsAt) ||
            item.startedAt <= 0 ||
            !isSessionDuration(item.durationMinutes) ||
            item.endsAt - item.startedAt !== item.durationMinutes * 60_000
        )
            return null;
        return {
            sessionId: item.sessionId,
            ownerKey: item.ownerKey,
            startedAt: item.startedAt,
            endsAt: item.endsAt,
            durationMinutes: item.durationMinutes,
        };
    } catch {
        return null;
    }
}

export function sessionIsActive(
    session: ExcerptSession | null,
    ownerKey: string | null,
    now: number,
) {
    return (
        !!session &&
        session.ownerKey === ownerKey &&
        session.startedAt <= now &&
        session.endsAt > now
    );
}

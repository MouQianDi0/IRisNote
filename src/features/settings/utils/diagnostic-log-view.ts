import type {
    DiagnosticEvent,
    DiagnosticLevel,
} from "@/core/diagnostics/diagnostic-log";

export type DiagnosticFilter = "all" | DiagnosticLevel;

export function filterDiagnosticEvents(
    events: readonly DiagnosticEvent[],
    filter: DiagnosticFilter,
): DiagnosticEvent[] {
    return filter === "all"
        ? [...events]
        : events.filter((event) => event.level === filter);
}

export function countDiagnosticLevels(
    events: readonly DiagnosticEvent[],
): Record<DiagnosticFilter, number> {
    const counts = { all: events.length, info: 0, warning: 0, error: 0 };
    for (const event of events) counts[event.level] += 1;
    return counts;
}

const pad = (value: number) => String(value).padStart(2, "0");

/** 本地时间 MM-DD HH:mm:ss；无法解析时原样返回。 */
export function diagnosticTimeLabel(timestamp: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return timestamp;
    return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
        date.getHours(),
    )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function diagnosticDetailsText(
    details: DiagnosticEvent["details"],
): string {
    if (!details) return "";
    return Object.entries(details)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join("  ");
}

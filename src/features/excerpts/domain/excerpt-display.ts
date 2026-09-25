import type { ExcerptEntity, ExcerptSource } from "../excerpts.types";

const SOURCE_LABELS: Record<ExcerptSource, string> = {
    paste: "粘贴",
    auto: "自动检测",
    manual: "手动",
};

const pad = (value: number) => String(value).padStart(2, "0");

/** 今天/昨天显示时分；今年显示月日；更早显示完整日期。 */
export function excerptTimeLabel(iso: string, now = new Date()): string {
    const date = new Date(iso);
    if (!Number.isFinite(date.getTime())) return "";
    const time = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
    const startOfToday = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
    ).getTime();
    const day = 24 * 60 * 60 * 1000;
    const stamp = date.getTime();
    if (stamp >= startOfToday && stamp < startOfToday + day)
        return `今天 ${time}`;
    if (stamp >= startOfToday - day && stamp < startOfToday)
        return `昨天 ${time}`;
    if (date.getFullYear() === now.getFullYear())
        return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
    return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function excerptMetaLabel(entity: ExcerptEntity, now = new Date()) {
    return [
        entity.isPinned ? "置顶" : null,
        SOURCE_LABELS[entity.source],
        excerptTimeLabel(entity.updatedAt, now),
    ]
        .filter(Boolean)
        .join(" · ");
}

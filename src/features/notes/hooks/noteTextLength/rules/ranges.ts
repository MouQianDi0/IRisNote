import type { TextRange } from "../types";

const rangesOverlap = (left: TextRange, right: TextRange) =>
    left.start < right.end && right.start < left.end;

export const overlapsAnyRange = (
    candidate: TextRange,
    ranges: TextRange[],
) => ranges.some((range) => rangesOverlap(candidate, range));

/**
 * 统一合并并删除重叠区间，保证各 Markdown 识别器无需重复处理游标逻辑。
 */
export const removeRanges = (
    content: string,
    ranges: TextRange[],
    separator = "",
) => {
    if (ranges.length === 0) return content;

    const sortedRanges = [...ranges].sort((left, right) => left.start - right.start);
    const parts: string[] = [];
    let cursor = 0;

    sortedRanges.forEach((range) => {
        if (range.end <= cursor) return;

        if (range.start > cursor) {
            parts.push(content.slice(cursor, range.start));
        }
        cursor = Math.max(cursor, range.end);
    });

    if (cursor < content.length) {
        parts.push(content.slice(cursor));
    }

    return parts.join(separator);
};

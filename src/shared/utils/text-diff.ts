export type TextDiffChunk = {
    type: "equal" | "delete" | "insert";
    lines: string[];
};
export type TextDiffResult =
    | {
          status: "complete";
          chunks: TextDiffChunk[];
          added: number;
          removed: number;
      }
    | { status: "too-large" };
export type TextDiffSection =
    | TextDiffChunk
    | {
          type: "fold";
          id: number;
          lines: string[];
      };
type Options = { maxWork?: number; batchSize?: number };
const TOO_LARGE: TextDiffResult = { status: "too-large" };

/** 空正文为零行；保留空格、空行与末尾换行，仅统一 CRLF/LF。 */
const splitLines = (text: string | null) =>
    !text ? [] : text.replace(/\r\n/g, "\n").split("\n");

/**
 * 历史 → 当前的 Myers 行级差异。每个批次 yield，由调用方安排下一批；
 * 输入、搜索工作量及渲染块数均有上限，不返回部分统计或不完整的差异。
 */
export function* diffTextLines(
    before: string | null,
    after: string | null,
    { maxWork = 200_000, batchSize = 2_048 }: Options = {},
): Generator<void, TextDiffResult, void> {
    if ((before?.length ?? 0) + (after?.length ?? 0) > 400_000)
        return TOO_LARGE;
    const oldLines = splitLines(before);
    const newLines = splitLines(after);
    if (oldLines.length + newLines.length > 12_000) return TOO_LARGE;
    // 参数限界，避免调用方传入零批次或无限预算使任务失去限流。
    const budget = Math.max(1, Math.min(200_000, maxWork || 1));
    const batch = Math.max(1, Math.min(2_048, batchSize || 1));
    let work = 0;
    let prefix = 0;
    let suffix = 0;
    while (
        prefix < oldLines.length &&
        prefix < newLines.length &&
        oldLines[prefix] === newLines[prefix]
    ) {
        prefix++;
        if (++work > budget) return TOO_LARGE;
        if (work % batch === 0) yield;
    }
    while (
        suffix < oldLines.length - prefix &&
        suffix < newLines.length - prefix &&
        oldLines[oldLines.length - 1 - suffix] ===
            newLines[newLines.length - 1 - suffix]
    ) {
        suffix++;
        if (++work > budget) return TOO_LARGE;
        if (work % batch === 0) yield;
    }
    const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
    const newMiddle = newLines.slice(prefix, newLines.length - suffix);
    const chunks: TextDiffChunk[] = [];
    const append = (type: TextDiffChunk["type"], lines: string[]) => {
        if (!lines.length) return;
        const last = chunks[chunks.length - 1];
        if (last?.type === type) last.lines.push(...lines);
        else chunks.push({ type, lines });
    };
    append("equal", oldLines.slice(0, prefix));

    // 完全重写且没有共享行时直接展示整段，避免无意义的二次方搜索。
    const oldSet = new Set<string>();
    for (const line of oldMiddle) {
        oldSet.add(line);
        if (++work > budget) return TOO_LARGE;
        if (work % batch === 0) yield;
    }
    let shared = false;
    for (const line of newMiddle) {
        if (oldSet.has(line)) {
            shared = true;
            break;
        }
        if (++work > budget) return TOO_LARGE;
        if (work % batch === 0) yield;
    }
    if (!shared) {
        append("delete", oldMiddle);
        append("insert", newMiddle);
    } else {
        const frontier = new Map<number, number>([[1, 0]]);
        const trace: Map<number, number>[] = [];
        search: for (
            let distance = 0;
            distance <= oldMiddle.length + newMiddle.length;
            distance++
        ) {
            trace.push(new Map(frontier));
            for (
                let diagonal = -distance;
                diagonal <= distance;
                diagonal += 2
            ) {
                if (++work > budget) return TOO_LARGE;
                if (work % batch === 0) yield;
                let x =
                    diagonal === -distance ||
                    (diagonal !== distance &&
                        (frontier.get(diagonal - 1) ?? -Infinity) <
                            (frontier.get(diagonal + 1) ?? -Infinity))
                        ? (frontier.get(diagonal + 1) ?? 0)
                        : (frontier.get(diagonal - 1) ?? 0) + 1;
                let y = x - diagonal;
                while (
                    x < oldMiddle.length &&
                    y < newMiddle.length &&
                    oldMiddle[x] === newMiddle[y]
                ) {
                    x++;
                    y++;
                    if (++work > budget) return TOO_LARGE;
                    if (work % batch === 0) yield;
                }
                frontier.set(diagonal, x);
                if (x >= oldMiddle.length && y >= newMiddle.length)
                    break search;
            }
        }
        const reversed: { type: TextDiffChunk["type"]; line: string }[] = [];
        let x = oldMiddle.length;
        let y = newMiddle.length;
        for (let distance = trace.length - 1; distance >= 0; distance--) {
            const previous = trace[distance];
            const diagonal = x - y;
            const previousDiagonal =
                diagonal === -distance ||
                (diagonal !== distance &&
                    (previous.get(diagonal - 1) ?? -Infinity) <
                        (previous.get(diagonal + 1) ?? -Infinity))
                    ? diagonal + 1
                    : diagonal - 1;
            const previousX = previous.get(previousDiagonal) ?? 0;
            const previousY = previousX - previousDiagonal;
            while (x > previousX && y > previousY) {
                reversed.push({ type: "equal", line: oldMiddle[--x] });
                y--;
                if (++work > budget) return TOO_LARGE;
                if (work % batch === 0) yield;
            }
            if (distance === 0) break;
            reversed.push(
                x === previousX
                    ? { type: "insert", line: newMiddle[--y] }
                    : { type: "delete", line: oldMiddle[--x] },
            );
            if (++work > budget) return TOO_LARGE;
            if (work % batch === 0) yield;
        }
        for (let index = reversed.length - 1; index >= 0; index--) {
            const { type, line } = reversed[index];
            append(type, [line]);
            if (chunks.length > 400) return TOO_LARGE;
            if (++work > budget) return TOO_LARGE;
            if (work % batch === 0) yield;
        }
    }
    append("equal", oldLines.slice(oldLines.length - suffix));
    return {
        status: "complete",
        chunks,
        added: chunks.reduce(
            (count, chunk) =>
                count + (chunk.type === "insert" ? chunk.lines.length : 0),
            0,
        ),
        removed: chunks.reduce(
            (count, chunk) =>
                count + (chunk.type === "delete" ? chunk.lines.length : 0),
            0,
        ),
    };
}

/** 差异前后各保留两行；相邻差异的上下文合并，长段可展开。 */
export function textDiffSections(
    chunks: TextDiffChunk[],
    context = 2,
): TextDiffSection[] {
    const sections: TextDiffSection[] = [];
    chunks.forEach((chunk, index) => {
        if (chunk.type !== "equal") {
            sections.push(chunk);
            return;
        }
        const leading = index > 0 ? context : 0;
        const trailing = index < chunks.length - 1 ? context : 0;
        if (chunk.lines.length <= Math.max(context * 2, leading + trailing)) {
            sections.push(chunk);
            return;
        }
        if (leading)
            sections.push({
                type: "equal",
                lines: chunk.lines.slice(0, leading),
            });
        sections.push({
            type: "fold",
            id: index,
            lines: chunk.lines.slice(leading, chunk.lines.length - trailing),
        });
        if (trailing)
            sections.push({
                type: "equal",
                lines: chunk.lines.slice(-trailing),
            });
    });
    return sections;
}

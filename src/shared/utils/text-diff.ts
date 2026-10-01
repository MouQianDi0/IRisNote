export type TextDiffSpan = {
    type: "equal" | "delete" | "insert";
    text: string;
};
export type TextDiffChunk = {
    type: "equal" | "delete" | "insert";
    lines: string[];
    /** 变更段内的字符投影；未改变的字符仍为 equal。 */
    spans?: TextDiffSpan[];
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
type Work = { used: number; limit: number; batch: number };
const createWork = ({
    maxWork = 200_000,
    batchSize = 2_048,
}: Options): Work => ({
    used: 0,
    limit: Math.max(1, Math.min(200_000, maxWork || 1)),
    batch: Math.max(1, Math.min(2_048, batchSize || 1)),
});

/** 空正文为零行；保留空格、空行与末尾换行，仅统一 CRLF/LF。 */
const splitLines = (text: string | null) =>
    !text ? [] : text.replace(/\r\n/g, "\n").split("\n");

/** 同一个 Myers 搜索用于行和 Unicode 码点，所有阶段共享工作预算。 */
function* diffSequence(
    oldLines: string[],
    newLines: string[],
    work: Work,
): Generator<void, TextDiffResult, void> {
    let prefix = 0;
    let suffix = 0;
    while (
        prefix < oldLines.length &&
        prefix < newLines.length &&
        oldLines[prefix] === newLines[prefix]
    ) {
        prefix++;
        if (++work.used > work.limit) return TOO_LARGE;
        if (work.used % work.batch === 0) yield;
    }
    while (
        suffix < oldLines.length - prefix &&
        suffix < newLines.length - prefix &&
        oldLines[oldLines.length - 1 - suffix] ===
            newLines[newLines.length - 1 - suffix]
    ) {
        suffix++;
        if (++work.used > work.limit) return TOO_LARGE;
        if (work.used % work.batch === 0) yield;
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

    // 没有共享单元时直接展示整段，避免无意义的二次方搜索。
    const oldSet = new Set<string>();
    for (const line of oldMiddle) {
        oldSet.add(line);
        if (++work.used > work.limit) return TOO_LARGE;
        if (work.used % work.batch === 0) yield;
    }
    let shared = false;
    for (const line of newMiddle) {
        if (oldSet.has(line)) {
            shared = true;
            break;
        }
        if (++work.used > work.limit) return TOO_LARGE;
        if (work.used % work.batch === 0) yield;
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
                if (++work.used > work.limit) return TOO_LARGE;
                if (work.used % work.batch === 0) yield;
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
                    if (++work.used > work.limit) return TOO_LARGE;
                    if (work.used % work.batch === 0) yield;
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
                if (++work.used > work.limit) return TOO_LARGE;
                if (work.used % work.batch === 0) yield;
            }
            if (distance === 0) break;
            reversed.push(
                x === previousX
                    ? { type: "insert", line: newMiddle[--y] }
                    : { type: "delete", line: oldMiddle[--x] },
            );
            if (++work.used > work.limit) return TOO_LARGE;
            if (work.used % work.batch === 0) yield;
        }
        for (let index = reversed.length - 1; index >= 0; index--) {
            const { type, line } = reversed[index];
            append(type, [line]);
            if (chunks.length > 400) return TOO_LARGE;
            if (++work.used > work.limit) return TOO_LARGE;
            if (work.used % work.batch === 0) yield;
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

/** 历史 → 当前的行级差异，保留原有行数语义。 */
export function* diffTextLines(
    before: string | null,
    after: string | null,
    options: Options = {},
): Generator<void, TextDiffResult, void> {
    if ((before?.length ?? 0) + (after?.length ?? 0) > 400_000)
        return TOO_LARGE;
    const oldLines = splitLines(before);
    const newLines = splitLines(after);
    if (oldLines.length + newLines.length > 12_000) return TOO_LARGE;
    return yield* diffSequence(oldLines, newLines, createWork(options));
}

function* characters(
    text: string,
    work: Work,
): Generator<void, string[] | null, void> {
    const units: string[] = [];
    // 字符串迭代按 Unicode 码点，不拆开 emoji/增补汉字的 UTF-16 代理对。
    for (const unit of text) {
        units.push(unit);
        if (++work.used > work.limit) return null;
        if (work.used % work.batch === 0) yield;
    }
    return units;
}

/**
 * 行级定位后精化连续变更段；added/removed 为字符数（空格、换行各计一）。
 * 相邻删除/新增作为整体比较，避免按行号硬配对扩大高亮；不返回局部统计。
 */
export function* diffTextWithCharacters(
    before: string | null,
    after: string | null,
    options: Options = {},
): Generator<void, TextDiffResult, void> {
    if ((before?.length ?? 0) + (after?.length ?? 0) > 400_000)
        return TOO_LARGE;
    const oldLines = splitLines(before);
    const newLines = splitLines(after);
    if (oldLines.length + newLines.length > 12_000) return TOO_LARGE;
    const work = createWork(options);
    const located = yield* diffSequence(oldLines, newLines, work);
    if (located.status !== "complete") return TOO_LARGE;
    const chunks: TextDiffChunk[] = [];
    let added = 0;
    let removed = 0;
    let spansCount = 0;
    for (let index = 0; index < located.chunks.length;) {
        const chunk = located.chunks[index];
        if (chunk.type === "equal") {
            chunks.push(chunk);
            index++;
            continue;
        }
        const first = index;
        const deleted: string[] = [];
        const inserted: string[] = [];
        while (
            index < located.chunks.length &&
            located.chunks[index].type !== "equal"
        ) {
            const next = located.chunks[index++];
            (next.type === "delete" ? deleted : inserted).push(...next.lines);
        }
        // 分隔符归入变更段：有后文时带尾换行，只有前文时带首换行。
        // 空行/末尾换行的增删因此不会误判成零字符变化。
        const trailing = index < located.chunks.length;
        const leading = !trailing && first > 0;
        const text = (lines: string[]) =>
            !lines.length
                ? ""
                : `${leading ? "\n" : ""}${lines.join("\n")}${trailing ? "\n" : ""}`;
        const oldUnits = yield* characters(text(deleted), work);
        if (!oldUnits) return TOO_LARGE;
        const newUnits = yield* characters(text(inserted), work);
        if (!newUnits) return TOO_LARGE;
        const refined = yield* diffSequence(oldUnits, newUnits, work);
        if (refined.status !== "complete") return TOO_LARGE;
        added += refined.added;
        removed += refined.removed;
        spansCount += refined.chunks.length;
        if (spansCount > 1_200) return TOO_LARGE;
        for (const type of ["delete", "insert"] as const) {
            const lines = type === "delete" ? deleted : inserted;
            if (!lines.length) continue;
            const spans = refined.chunks
                .filter(
                    (part) =>
                        part.type !== (type === "delete" ? "insert" : "delete"),
                )
                .map((part) => ({
                    type: part.type,
                    text: part.lines.join(""),
                }));
            // 两侧都有正文时，共有的边界换行是展示外的上下文。
            if (leading && spans[0]?.type === "equal")
                spans[0].text = spans[0].text.slice(1);
            const last = spans[spans.length - 1];
            if (trailing && last?.type === "equal")
                last.text = last.text.slice(0, -1);
            chunks.push({
                type,
                lines,
                spans: spans.filter((part) => part.text.length > 0),
            });
        }
        if (++work.used > work.limit) return TOO_LARGE;
        if (work.used % work.batch === 0) yield;
    }
    return { status: "complete", chunks, added, removed };
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

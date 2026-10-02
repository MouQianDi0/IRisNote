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
export type TextDiffResult = {
    status: "complete";
    chunks: TextDiffChunk[];
    added: number;
    removed: number;
};
export type CharacterTextDiffResult = TextDiffResult & {
    /** 原始顺序的全文片段；共有文字只保留一份，可分别投影还原两侧。 */
    spans: TextDiffSpan[];
    /** 连续增删为一处，相邻删除/新增的替换合并计数。 */
    changes: number;
};
export type TextDiffSection =
    | TextDiffChunk
    | {
          type: "fold";
          id: number;
          lines: string[];
      };
type Options = { batchSize?: number };
type Work = { used: number; batch: number };
const createWork = ({ batchSize = 2_048 }: Options): Work => ({
    used: 0,
    batch: Number.isFinite(batchSize)
        ? Math.max(1, Math.min(2_048, Math.floor(batchSize)))
        : 2_048,
});
const pause = (work: Work) => ++work.used % work.batch === 0;

/** 空正文为零行；保留空格、空行与末尾换行，仅统一 CRLF/LF。 */
const splitLines = (text: string | null) =>
    !text ? [] : text.replace(/\r\n/g, "\n").split("\n");

type Range = {
    oldStart: number;
    oldEnd: number;
    newStart: number;
    newEnd: number;
};
type SequenceTask =
    | ({ kind: "compare" } & Range)
    | { kind: "equal"; start: number; end: number };

/** 双向 Myers 寻找最短编辑路径的交点；不保留逐层回溯表。 */
function* middleSplit(
    before: string[],
    after: string[],
    range: Range,
    work: Work,
): Generator<void, { old: number; next: number }, void> {
    const n = range.oldEnd - range.oldStart;
    const m = range.newEnd - range.newStart;
    const delta = n - m;
    const odd = delta % 2 !== 0;
    const distanceLimit = Math.ceil((n + m) / 2);
    const offset = distanceLimit + 1;
    const forward = new Int32Array(2 * distanceLimit + 3).fill(-1);
    const backward = new Int32Array(forward.length).fill(-1);
    forward[offset + 1] = backward[offset + 1] = 0;
    let forwardStart = 0,
        forwardEnd = 0,
        backwardStart = 0,
        backwardEnd = 0;

    for (let distance = 0; distance <= distanceLimit; distance++) {
        for (
            let diagonal = -distance + forwardStart;
            diagonal <= distance - forwardEnd;
            diagonal += 2
        ) {
            const index = offset + diagonal;
            let x =
                diagonal === -distance ||
                (diagonal !== distance &&
                    forward[index - 1] < forward[index + 1])
                    ? forward[index + 1]
                    : forward[index - 1] + 1;
            let y = x - diagonal;
            while (
                x < n &&
                y < m &&
                before[range.oldStart + x] === after[range.newStart + y]
            ) {
                x++;
                y++;
                if (pause(work)) yield;
            }
            forward[index] = x;
            if (x > n) forwardEnd += 2;
            else if (y > m) forwardStart += 2;
            else if (odd) {
                const reverseDiagonal = delta - diagonal;
                if (
                    Math.abs(reverseDiagonal) <= distance - 1 &&
                    backward[offset + reverseDiagonal] >= 0 &&
                    x + backward[offset + reverseDiagonal] >= n
                )
                    return {
                        old: range.oldStart + x,
                        next: range.newStart + y,
                    };
            }
            if (pause(work)) yield;
        }
        for (
            let diagonal = -distance + backwardStart;
            diagonal <= distance - backwardEnd;
            diagonal += 2
        ) {
            const index = offset + diagonal;
            let x =
                diagonal === -distance ||
                (diagonal !== distance &&
                    backward[index - 1] < backward[index + 1])
                    ? backward[index + 1]
                    : backward[index - 1] + 1;
            let y = x - diagonal;
            while (
                x < n &&
                y < m &&
                before[range.oldEnd - x - 1] === after[range.newEnd - y - 1]
            ) {
                x++;
                y++;
                if (pause(work)) yield;
            }
            backward[index] = x;
            if (x > n) backwardEnd += 2;
            else if (y > m) backwardStart += 2;
            else if (!odd) {
                const forwardDiagonal = delta - diagonal;
                const front = forward[offset + forwardDiagonal];
                if (
                    Math.abs(forwardDiagonal) <= distance &&
                    front >= 0 &&
                    front + x >= n
                )
                    return {
                        old: range.oldStart + front,
                        next: range.newStart + front - forwardDiagonal,
                    };
            }
            if (pause(work)) yield;
        }
    }
    throw new Error("无法定位正文差异，请重试");
}

/** 范围索引和显式栈分治，避免切片复制、递归栈及大数组展开参数。 */
function* diffSequence(
    before: string[],
    after: string[],
    work: Work,
): Generator<void, TextDiffResult, void> {
    const chunks: TextDiffChunk[] = [];
    let added = 0,
        removed = 0;
    const append = function* (
        type: TextDiffChunk["type"],
        source: string[],
        start: number,
        end: number,
    ) {
        if (start === end) return;
        let target = chunks[chunks.length - 1];
        if (target?.type !== type) {
            target = { type, lines: [] };
            chunks.push(target);
        }
        for (let index = start; index < end; index++) {
            target.lines.push(source[index]);
            if (type === "insert") added++;
            else if (type === "delete") removed++;
            if (pause(work)) yield;
        }
    };
    const tasks: SequenceTask[] = [
        {
            kind: "compare",
            oldStart: 0,
            oldEnd: before.length,
            newStart: 0,
            newEnd: after.length,
        },
    ];
    while (tasks.length) {
        const task = tasks.pop()!;
        if (task.kind === "equal") {
            yield* append("equal", before, task.start, task.end);
            continue;
        }
        let { oldStart, oldEnd, newStart, newEnd } = task;
        const prefix = oldStart;
        while (
            oldStart < oldEnd &&
            newStart < newEnd &&
            before[oldStart] === after[newStart]
        ) {
            oldStart++;
            newStart++;
            if (pause(work)) yield;
        }
        yield* append("equal", before, prefix, oldStart);
        const suffixEnd = oldEnd;
        while (
            oldStart < oldEnd &&
            newStart < newEnd &&
            before[oldEnd - 1] === after[newEnd - 1]
        ) {
            oldEnd--;
            newEnd--;
            if (pause(work)) yield;
        }
        if (oldEnd < suffixEnd)
            tasks.push({ kind: "equal", start: oldEnd, end: suffixEnd });
        if (oldStart === oldEnd) {
            yield* append("insert", after, newStart, newEnd);
            continue;
        }
        if (newStart === newEnd) {
            yield* append("delete", before, oldStart, oldEnd);
            continue;
        }
        // 没有共有单元时直接输出完整增删，完全重写无需做二次方搜索。
        const oldIsShorter = oldEnd - oldStart <= newEnd - newStart;
        const short = oldIsShorter ? before : after;
        const long = oldIsShorter ? after : before;
        const shortStart = oldIsShorter ? oldStart : newStart;
        const shortEnd = oldIsShorter ? oldEnd : newEnd;
        const longStart = oldIsShorter ? newStart : oldStart;
        const longEnd = oldIsShorter ? newEnd : oldEnd;
        const units = new Set<string>();
        for (let index = shortStart; index < shortEnd; index++) {
            units.add(short[index]);
            if (pause(work)) yield;
        }
        let shared = false;
        for (let index = longStart; index < longEnd; index++) {
            if (units.has(long[index])) {
                shared = true;
                break;
            }
            if (pause(work)) yield;
        }
        units.clear();
        if (!shared) {
            yield* append("delete", before, oldStart, oldEnd);
            yield* append("insert", after, newStart, newEnd);
            continue;
        }
        const split = yield* middleSplit(
            before,
            after,
            { oldStart, oldEnd, newStart, newEnd },
            work,
        );
        if (
            (split.old === oldStart && split.next === newStart) ||
            (split.old === oldEnd && split.next === newEnd)
        )
            throw new Error("正文差异分段未取得进展，请重试");
        tasks.push(
            {
                kind: "compare",
                oldStart: split.old,
                oldEnd,
                newStart: split.next,
                newEnd,
            },
            {
                kind: "compare",
                oldStart,
                oldEnd: split.old,
                newStart,
                newEnd: split.next,
            },
        );
    }
    return { status: "complete", chunks, added, removed };
}

/** 历史 → 当前的行级差异，完整比较；任务可在批次间以 return(undefined) 取消。 */
export function* diffTextLines(
    before: string | null,
    after: string | null,
    options: Options = {},
): Generator<void, TextDiffResult | undefined, void> {
    return yield* diffSequence(
        splitLines(before),
        splitLines(after),
        createWork(options),
    );
}

function* characters(
    text: string,
    work: Work,
): Generator<void, string[], void> {
    const units: string[] = [];
    // Unicode 码点，不拆开 emoji/增补汉字的 UTF-16 代理对。
    for (const unit of text) {
        units.push(unit);
        if (pause(work)) yield;
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
): Generator<void, CharacterTextDiffResult | undefined, void> {
    const oldLines = splitLines(before);
    const newLines = splitLines(after);
    const work = createWork(options);
    const located = yield* diffSequence(oldLines, newLines, work);
    const chunks: TextDiffChunk[] = [];
    const spans: TextDiffSpan[] = [];
    const lastContextIndex = located.chunks.reduce(
        (last, part, index) => (part.type === "equal" ? index : last),
        -1,
    );
    const appendSpan = (type: TextDiffSpan["type"], text: string) => {
        if (!text) return;
        const last = spans[spans.length - 1];
        if (last?.type === type) last.text += text;
        else spans.push({ type, text });
    };
    let added = 0;
    let removed = 0;
    for (let index = 0; index < located.chunks.length;) {
        const chunk = located.chunks[index];
        if (chunk.type === "equal") {
            chunks.push(chunk);
            appendSpan("equal", chunk.lines.join("\n"));
            // 中间变更段归属尾换行，末尾变更段归属首换行，避免全文漏掉/重复分隔符。
            if (index < lastContextIndex) appendSpan("equal", "\n");
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
            const target = next.type === "delete" ? deleted : inserted;
            for (const line of next.lines) {
                target.push(line);
                if (pause(work)) yield;
            }
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
        const newUnits = yield* characters(text(inserted), work);
        const refined = yield* diffSequence(oldUnits, newUnits, work);
        added += refined.added;
        removed += refined.removed;
        for (const part of refined.chunks)
            appendSpan(part.type, part.lines.join(""));
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
        if (pause(work)) yield;
    }
    const changes = spans.reduce(
        (count, span, index) =>
            count +
            (span.type !== "equal" &&
            (index === 0 || spans[index - 1].type === "equal")
                ? 1
                : 0),
        0,
    );
    return { status: "complete", chunks, spans, added, removed, changes };
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

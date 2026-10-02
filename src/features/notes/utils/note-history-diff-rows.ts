import {
    textDiffSections,
    type TextDiffChunk,
    type TextDiffSpan,
} from "@/shared/utils/text-diff";

export type HistoryDiffReveal = { before: number; after: number };
export type HistoryDiffLine = {
    kind: "line";
    key: string;
    oldLine: number | null;
    newLine: number | null;
    chunk: TextDiffChunk;
};
export type HistoryDiffFold = {
    kind: "fold";
    key: string;
    id: number;
    oldLine: number;
    newLine: number;
    total: number;
    hidden: number;
    reveal: HistoryDiffReveal;
};
export type HistoryDiffRow = HistoryDiffLine | HistoryDiffFold;

/** 按实际源行分配字符片段；变更边界的虚拟换行附在首/尾行，不制造额外行号。 */
function splitChunk(chunk: TextDiffChunk): TextDiffChunk[] {
    if (!chunk.spans)
        return chunk.lines.map((line) => ({ type: chunk.type, lines: [line] }));
    const source = chunk.lines.join("\n");
    const projection = chunk.spans.map((span) => span.text).join("");
    const leading = projection === `\n${source}`;
    const trailing = !leading && projection === `${source}\n`;
    const spansByLine: TextDiffSpan[][] = chunk.lines.map(() => []);
    let line = 0;
    let position = 0;
    const append = (type: TextDiffSpan["type"], text: string) => {
        if (!text) return;
        const target = spansByLine[line];
        const last = target[target.length - 1];
        if (last?.type === type) last.text += text;
        else target.push({ type, text });
    };
    for (const span of chunk.spans) {
        const parts = span.text.split("\n");
        parts.forEach((part, index) => {
            append(span.type, part);
            position += part.length;
            if (index === parts.length - 1) return;
            if (span.type !== "equal") append(span.type, "\n");
            const boundary =
                (leading && position === 0) ||
                (trailing && position === projection.length - 1);
            if (!boundary) line++;
            position++;
        });
    }
    return chunk.lines.map((text, index) => ({
        type: chunk.type,
        lines: [text],
        spans: spansByLine[index],
    }));
}

/** 折叠不影响两侧源行号；只创建行数据，具体 Text 由虚拟列表按需渲染。 */
export function historyDiffRows(
    chunks: TextDiffChunk[],
    reveals: Readonly<Record<number, HistoryDiffReveal>> = {},
): HistoryDiffRow[] {
    const rows: HistoryDiffRow[] = [];
    let oldLine = 1;
    let newLine = 1;
    textDiffSections(chunks).forEach((section, index) => {
        const addLine = (chunk: TextDiffChunk, offset: number) => {
            rows.push({
                kind: "line",
                key: `${index}-line-${offset}`,
                oldLine: chunk.type === "insert" ? null : oldLine++,
                newLine: chunk.type === "delete" ? null : newLine++,
                chunk,
            });
        };
        if (section.type !== "fold") {
            splitChunk(section).forEach(addLine);
            return;
        }
        const total = section.lines.length;
        const requested = reveals[section.id];
        const before = Math.min(total, Math.max(0, requested?.before ?? 0));
        const after = Math.min(
            total - before,
            Math.max(0, requested?.after ?? 0),
        );
        for (let offset = 0; offset < before; offset++)
            addLine({ type: "equal", lines: [section.lines[offset]] }, offset);
        const hidden = total - before - after;
        rows.push({
            kind: "fold",
            key: `${index}-fold`,
            id: section.id,
            oldLine,
            newLine,
            total,
            hidden,
            reveal: { before, after },
        });
        oldLine += hidden;
        newLine += hidden;
        for (let offset = total - after; offset < total; offset++)
            addLine({ type: "equal", lines: [section.lines[offset]] }, offset);
    });
    return rows;
}

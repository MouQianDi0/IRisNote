import type { TextDiffSpan } from "@/shared/utils/text-diff";

export type HistoryDiffRow = { key: string; spans: TextDiffSpan[] };

/** 全文按换行拆成虚拟列表段落，保留分隔符用于双向重建；没有隐藏区域或两侧行号。 */
export function historyDiffRows(
    spans: readonly TextDiffSpan[],
): HistoryDiffRow[] {
    const rows: HistoryDiffRow[] = [{ key: "body-0", spans: [] }];
    const append = (type: TextDiffSpan["type"], text: string) => {
        if (!text) return;
        const row = rows[rows.length - 1];
        const last = row.spans[row.spans.length - 1];
        if (last?.type === type) last.text += text;
        else row.spans.push({ type, text });
    };
    for (const span of spans) {
        const parts = span.text.split("\n");
        parts.forEach((part, index) => {
            append(span.type, part);
            if (index === parts.length - 1) return;
            append(span.type, "\n");
            rows.push({ key: `body-${rows.length}`, spans: [] });
        });
    }
    return rows;
}

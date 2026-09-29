export type MarkdownBlock = {
    kind: "heading" | "paragraph" | "item" | "literal";
    text: string;
    level?: number;
    marker?: string;
};

export type MarkdownSpan = {
    kind: "text" | "strong" | "code";
    text: string;
};

export type MarkdownOptions = {
    /** Optional exact plain-text headings supplied by the caller. */
    plainTextHeadings?: readonly string[];
};

/** A deliberately small Markdown subset; unrecognised content stays readable. */
export function parseMarkdown(
    source: string,
    options?: MarkdownOptions,
): MarkdownBlock[] {
    const blocks: MarkdownBlock[] = [];
    const lines = source.replace(/\r\n?/g, "\n").split("\n");
    let paragraph: string[] = [];
    const flush = () => {
        if (paragraph.length) {
            blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
            paragraph = [];
        }
    };
    for (let index = 0; index < lines.length; index++) {
        const line = lines[index].trim();
        if (!line) {
            flush();
            continue;
        }
        // Keep unsupported fenced blocks intact, including their delimiters.
        const fenceMatch = /^(`{3,}|~{3,})/.exec(line);
        if (fenceMatch) {
            flush();
            const raw = [lines[index]];
            const delimiter = fenceMatch[1];
            while (++index < lines.length) {
                raw.push(lines[index]);
                const closing = lines[index].trim();
                if (
                    closing.length >= delimiter.length &&
                    [...closing].every((char) => char === delimiter[0])
                )
                    break;
            }
            blocks.push({ kind: "literal", text: raw.join("\n") });
            continue;
        }
        const heading = /^(#{1,6})\s+(.+?)(?:\s+#+)?$/.exec(line);
        if (heading || options?.plainTextHeadings?.includes(line)) {
            flush();
            blocks.push({
                kind: "heading",
                text: heading ? heading[2] : line,
                level: heading ? heading[1].length : 2,
            });
            continue;
        }
        const item = /^(?:([-+*])\s+|(\d+[.)])\s+)(.+)$/.exec(line);
        if (item) {
            flush();
            blocks.push({
                kind: "item",
                marker: item[2] ?? "•",
                text: item[3],
            });
            continue;
        }
        paragraph.push(lines[index]);
    }
    flush();
    return blocks;
}

/** Inline code takes precedence; unmatched markup is retained as text. */
export function parseMarkdownInline(text: string): MarkdownSpan[] {
    const spans: MarkdownSpan[] = [];
    const pattern = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|__([^_\n]+)__/g;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
        const index = match.index;
        if (index > offset)
            spans.push({ kind: "text", text: text.slice(offset, index) });
        spans.push({
            kind: match[1] !== undefined ? "code" : "strong",
            text: match[1] ?? match[2] ?? match[3],
        });
        offset = index + match[0].length;
    }
    if (offset < text.length)
        spans.push({ kind: "text", text: text.slice(offset) });
    return spans;
}

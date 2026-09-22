import type { CodeRange, LinkRange, TableRange, TextRange } from "../types";
import { overlapsAnyRange } from "./ranges";

const TRAILING_URL_PUNCTUATION_PATTERN = /[.,!?;:，。！？；：)\]}]+$/u;
const TABLE_SEPARATOR_PATTERN =
    /^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$/u;

export const stripMarkdownSyntax = (content: string) =>
    content
        .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
        .replace(/^\s{0,3}>\s?/gmu, "")
        .replace(/^\s*(?:[-+*]|\d+[.)])\s+/gmu, "")
        .replace(/[*_~]+/gu, "")
        .replace(/\\([\\`*_[\]{}()#+\-.!>])/gu, "$1");

const getCodeContent = (rawCode: string, kind: CodeRange["kind"]) => {
    if (kind === "inline") {
        return rawCode.slice(1, -1);
    }

    return rawCode
        .replace(/^```[^\r\n]*(?:\r\n|\r|\n)?/u, "")
        .replace(/```$/u, "");
};

/**
 * 代码必须最先识别，避免其中的表格、图片或 URL 被当成笔记正文结构。
 */
export const detectCodeRanges = (content: string) => {
    const ranges: CodeRange[] = [];
    const blockPattern = /```[^\r\n]*(?:\r\n|\r|\n)?[\s\S]*?(?:```|$)/gu;

    for (const match of content.matchAll(blockPattern)) {
        const start = match.index;
        const rawCode = match[0];
        ranges.push({
            start,
            end: start + rawCode.length,
            content: getCodeContent(rawCode, "block"),
            kind: "block",
        });
    }

    const inlinePattern = /`[^`\r\n]+`/gu;
    for (const match of content.matchAll(inlinePattern)) {
        const start = match.index;
        const rawCode = match[0];
        const candidate = { start, end: start + rawCode.length };
        if (overlapsAnyRange(candidate, ranges)) continue;

        ranges.push({
            ...candidate,
            content: getCodeContent(rawCode, "inline"),
            kind: "inline",
        });
    }

    return ranges;
};

const getLines = (content: string) => {
    const lines: { text: string; start: number; end: number }[] = [];
    const linePattern = /[^\r\n]*(?:(?:\r\n|\r|\n)|$)/gu;

    for (const match of content.matchAll(linePattern)) {
        if (!match[0]) break;

        const start = match.index;
        const text = match[0].replace(/(?:\r\n|\r|\n)$/u, "");
        lines.push({
            text,
            start,
            end: start + match[0].length,
        });
    }

    return lines;
};

const splitTableCells = (line: string) => {
    const normalizedLine = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
    return normalizedLine.split("|").map((cell) => cell.trim());
};

export const detectTableRanges = (
    content: string,
    excludedRanges: TextRange[],
) => {
    const lines = getLines(content);
    const tables: TableRange[] = [];

    for (let index = 0; index < lines.length - 1; index += 1) {
        const headerLine = lines[index];
        const separatorLine = lines[index + 1];
        if (
            !headerLine.text.includes("|") ||
            !TABLE_SEPARATOR_PATTERN.test(separatorLine.text)
        ) {
            continue;
        }

        const rows = [splitTableCells(headerLine.text)];
        let lastLineIndex = index + 1;

        for (
            let rowIndex = index + 2;
            rowIndex < lines.length && lines[rowIndex].text.includes("|");
            rowIndex += 1
        ) {
            rows.push(splitTableCells(lines[rowIndex].text));
            lastLineIndex = rowIndex;
        }

        const candidate = {
            start: headerLine.start,
            end: lines[lastLineIndex].end,
        };
        if (overlapsAnyRange(candidate, excludedRanges)) continue;

        const cells = rows.flat();
        tables.push({
            ...candidate,
            text: cells.join(" "),
            cells,
            rows: rows.length,
            columns: Math.max(0, ...rows.map((row) => row.length)),
        });
        index = lastLineIndex;
    }

    return tables;
};

export const detectImageRanges = (
    content: string,
    excludedRanges: TextRange[],
) => {
    const ranges: TextRange[] = [];
    const imagePattern = /!\[[^\]]*\]\([^)\s]+(?:\s+["'][^"']*["'])?\)/gu;

    for (const match of content.matchAll(imagePattern)) {
        const start = match.index;
        const candidate = { start, end: start + match[0].length };
        if (overlapsAnyRange(candidate, excludedRanges)) continue;
        ranges.push(candidate);
    }

    return ranges;
};

export const detectLinkRanges = (
    content: string,
    excludedRanges: TextRange[],
) => {
    const links: LinkRange[] = [];
    const markdownLinkPattern =
        /\[[^\]]+\]\(((?:https?:\/\/|www\.)[^)\s]+)(?:\s+["'][^"']*["'])?\)/giu;

    for (const match of content.matchAll(markdownLinkPattern)) {
        const start = match.index;
        const candidate = { start, end: start + match[0].length };
        if (overlapsAnyRange(candidate, excludedRanges)) continue;

        links.push({
            ...candidate,
            url: match[1],
        });
    }

    const rawLinkPattern = /\b(?:https?:\/\/|www\.)[^\s<>()]+/giu;
    for (const match of content.matchAll(rawLinkPattern)) {
        const start = match.index;
        const url = match[0].replace(TRAILING_URL_PUNCTUATION_PATTERN, "");
        const candidate = { start, end: start + url.length };
        if (
            !url ||
            overlapsAnyRange(candidate, [...excludedRanges, ...links])
        ) {
            continue;
        }

        links.push({
            ...candidate,
            url,
        });
    }

    return links;
};

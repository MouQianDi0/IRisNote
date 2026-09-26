import { getOrCreateCachedNoteStatistics } from "./cache/noteStatisticsCache";
import { countCharacters, HAN_CHARACTER_PATTERN } from "./rules/characters";
import { countChineseWords } from "./rules/chinese";
import { countEnglishWords } from "./rules/english";
import {
    detectCodeRanges,
    detectImageRanges,
    detectLinkRanges,
    detectTableRanges,
    stripMarkdownSyntax,
} from "./rules/markdown";
import { calculateReadingTimeMinutes } from "./rules/readingTime";
import { removeRanges } from "./rules/ranges";
import { NOTE_STATISTICS_RULE_VERSION } from "./rules/version";
import type { NoteStatisticsOptions, NoteTextStatistics } from "./types";

export { NOTE_STATISTICS_RULE_VERSION };
export type {
    ChineseSegmentationMode,
    NoteStatisticsOptions,
    NoteTextStatistics,
} from "./types";

export const DEFAULT_NOTE_STATISTICS_OPTIONS: NoteStatisticsOptions = {
    includeCode: false,
    excludeMarkdownSyntax: true,
};

/**
 * 统计编排层只定义数据流；字符、语言和 Markdown 细节由各规则模块维护。
 */
const analyzeNoteText = (
    content: string,
    options: NoteStatisticsOptions,
): NoteTextStatistics => {
    // 识别顺序决定重叠实体的归属，必须保持代码、表格、图片、链接的优先级。
    const codeRanges = detectCodeRanges(content);
    const tableRanges = detectTableRanges(content, codeRanges);
    const imageRanges = detectImageRanges(content, [
        ...codeRanges,
        ...tableRanges,
    ]);
    const linkRanges = detectLinkRanges(content, [
        ...codeRanges,
        ...tableRanges,
        ...imageRanges,
    ]);
    const normalTextRanges = [
        ...codeRanges,
        ...tableRanges,
        ...imageRanges,
        ...linkRanges,
    ];
    const rawNormalText = removeRanges(content, normalTextRanges, " ");
    const rawNormalCharacterText = removeRanges(content, normalTextRanges);
    const normalText = options.excludeMarkdownSyntax
        ? stripMarkdownSyntax(rawNormalText)
        : rawNormalText;
    const normalCharacterText = options.excludeMarkdownSyntax
        ? stripMarkdownSyntax(rawNormalCharacterText)
        : rawNormalCharacterText;
    const tableText = tableRanges
        .map((table) =>
            options.excludeMarkdownSyntax
                ? stripMarkdownSyntax(table.text)
                : table.text,
        )
        .join(" ");
    const codeText = codeRanges.map((range) => range.content).join(" ");
    const effectiveText = [
        normalText,
        tableText,
        options.includeCode ? codeText : "",
    ]
        .filter(Boolean)
        .join(" ")
        .trim();
    const chineseCharacters = Array.from(effectiveText).filter((character) =>
        HAN_CHARACTER_PATTERN.test(character),
    ).length;
    const chineseWordResult = countChineseWords(
        effectiveText,
        chineseCharacters,
    );
    const englishWords = countEnglishWords(effectiveText);
    const readingTimeMinutes = calculateReadingTimeMinutes(
        chineseCharacters,
        englishWords,
    );
    const linkCharacters = linkRanges.reduce(
        (total, link) => total + countCharacters(link.url),
        0,
    );
    const codeCharacters = codeRanges.reduce(
        (total, range) => total + countCharacters(range.content),
        0,
    );
    const tableCharacters = tableRanges.reduce((total, table) => {
        const cellCharacters = table.cells.reduce((cellTotal, cell) => {
            const normalizedCell = options.excludeMarkdownSyntax
                ? stripMarkdownSyntax(cell)
                : cell;
            return cellTotal + countCharacters(normalizedCell);
        }, 0);
        return total + cellCharacters;
    }, 0);
    const normalTextCharacters = countCharacters(normalCharacterText.trim());

    return {
        ruleVersion: NOTE_STATISTICS_RULE_VERSION,
        totalCharacters: countCharacters(content),
        effectiveCharacters:
            normalTextCharacters +
            tableCharacters +
            linkCharacters +
            (options.includeCode ? codeCharacters : 0),
        normalTextCharacters,
        chineseCharacters,
        chineseWords: chineseWordResult.count,
        chineseSegmentationMode: chineseWordResult.mode,
        englishWords,
        linkEntities: linkRanges.length,
        readingTimeMinutes,
        links: {
            count: linkRanges.length,
            characters: linkCharacters,
        },
        code: {
            blockCount: codeRanges.filter((range) => range.kind === "block")
                .length,
            inlineCount: codeRanges.filter((range) => range.kind === "inline")
                .length,
            characters: codeCharacters,
            included: options.includeCode,
        },
        images: {
            count: imageRanges.length,
        },
        tables: {
            count: tableRanges.length,
            rows: tableRanges.reduce((total, table) => total + table.rows, 0),
            maxColumns: Math.max(
                0,
                ...tableRanges.map((table) => table.columns),
            ),
            characters: tableCharacters,
        },
    };
};

const getOptionsCacheKey = (options: NoteStatisticsOptions) =>
    [
        NOTE_STATISTICS_RULE_VERSION,
        options.includeCode ? 1 : 0,
        options.excludeMarkdownSyntax ? 1 : 0,
    ].join(":");

export const getCachedNoteTextStatistics = (
    noteId: number,
    content: string | null,
    options: NoteStatisticsOptions = DEFAULT_NOTE_STATISTICS_OPTIONS,
) => {
    const contentSnapshot = content ?? "";
    const optionsKey = getOptionsCacheKey(options);

    return getOrCreateCachedNoteStatistics({
        noteId,
        contentSnapshot,
        optionsKey,
        calculate: () => analyzeNoteText(contentSnapshot, options),
    });
};

/** 保留旧调用名称，但返回新的底层核心指标“总字符数”。 */
export const getCachedNoteTextLength = (
    noteId: number,
    content: string | null,
) => getCachedNoteTextStatistics(noteId, content).totalCharacters;

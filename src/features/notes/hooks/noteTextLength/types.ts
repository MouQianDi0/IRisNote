export type NoteStatisticsOptions = {
    includeCode: boolean;
    excludeMarkdownSyntax: boolean;
};

export type ChineseSegmentationMode = "word" | "character-fallback";

export type NoteTextStatistics = {
    ruleVersion: number;
    totalCharacters: number;
    effectiveCharacters: number;
    normalTextCharacters: number;
    chineseCharacters: number;
    chineseWords: number;
    chineseSegmentationMode: ChineseSegmentationMode;
    englishWords: number;
    linkEntities: number;
    readingTimeMinutes: number;
    links: {
        count: number;
        characters: number;
    };
    code: {
        blockCount: number;
        inlineCount: number;
        characters: number;
        included: boolean;
    };
    images: {
        count: number;
    };
    tables: {
        count: number;
        rows: number;
        maxColumns: number;
        characters: number;
    };
};

export type TextRange = {
    start: number;
    end: number;
};

export type CodeRange = TextRange & {
    content: string;
    kind: "block" | "inline";
};

export type LinkRange = TextRange & {
    url: string;
};

export type TableRange = TextRange & {
    text: string;
    cells: string[];
    rows: number;
    columns: number;
};

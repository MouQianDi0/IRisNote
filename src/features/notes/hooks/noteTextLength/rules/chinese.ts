import type { ChineseSegmentationMode } from "../types";
import { HAN_CHARACTER_PATTERN } from "./characters";

type SegmentResult = {
    segment: string;
    isWordLike?: boolean;
};

type SegmenterLike = {
    segment: (input: string) => Iterable<SegmentResult>;
};

type SegmenterConstructor = new (
    locale: string,
    options: { granularity: "word" },
) => SegmenterLike;

/**
 * 优先使用运行时中文分词能力；不支持 Intl.Segmenter 时显式退化为逐汉字统计。
 */
export const countChineseWords = (
    content: string,
    chineseCharacters: number,
): {
    count: number;
    mode: ChineseSegmentationMode;
} => {
    const segmenterConstructor = (
        Intl as typeof Intl & { Segmenter?: SegmenterConstructor }
    ).Segmenter;

    if (!segmenterConstructor) {
        return {
            count: chineseCharacters,
            mode: "character-fallback",
        };
    }

    const segmenter = new segmenterConstructor("zh-CN", {
        granularity: "word",
    });
    let count = 0;

    for (const result of segmenter.segment(content)) {
        if (
            result.isWordLike &&
            HAN_CHARACTER_PATTERN.test(result.segment)
        ) {
            count += 1;
        }
    }

    return {
        count,
        mode: "word",
    };
};

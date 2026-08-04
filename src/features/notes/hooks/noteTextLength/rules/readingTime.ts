/** 阅读时长沿用中文 500 字/分钟、英文 200 词/分钟的现有口径。 */
export const calculateReadingTimeMinutes = (
    chineseCharacters: number,
    englishWords: number,
) => chineseCharacters / 500 + englishWords / 200;

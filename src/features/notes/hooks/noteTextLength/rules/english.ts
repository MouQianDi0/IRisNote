import { HAN_CHARACTER_PATTERN } from "./characters";

const ENGLISH_WORD_CHARACTER_PATTERN = /[\p{Script=Latin}\p{N}]/u;
const WORD_BOUNDARY_PATTERN = /[\s/／]/u;

/**
 * 保留现有业务口径：汉字、空白和斜杠结束词组，拉丁字符或数字使词组有效。
 */
export const countEnglishWords = (content: string) => {
    let englishWords = 0;
    let hasEnglishWordCharacter = false;

    const finishWord = () => {
        if (!hasEnglishWordCharacter) return;
        englishWords += 1;
        hasEnglishWordCharacter = false;
    };

    for (const character of content) {
        if (
            HAN_CHARACTER_PATTERN.test(character) ||
            WORD_BOUNDARY_PATTERN.test(character)
        ) {
            finishWord();
            continue;
        }

        if (ENGLISH_WORD_CHARACTER_PATTERN.test(character)) {
            hasEnglishWordCharacter = true;
        }
    }

    finishWord();
    return englishWords;
};

export const HAN_CHARACTER_PATTERN = /\p{Script=Han}/u;

/** 按 Unicode 码点计数，避免代理对被固定拆成两个 UTF-16 单元。 */
export const countCharacters = (value: string) => Array.from(value).length;

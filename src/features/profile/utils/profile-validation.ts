import type { UserGender } from "@/shared/types/user";

/** 与服务端一致的长度上限，按 Unicode 码点计数。 */
export const NICKNAME_MAX = 30;
export const BIO_MAX = 200;
export const GENDER_CUSTOM_MAX = 20;

export function codePointLength(value: string): number {
    return [...value].length;
}

export type FieldCheck = { value: string | null; error: string | null };

/** 用户名：去首尾空白，1–30 个字，不含换行。 */
export function checkNickname(input: string): FieldCheck {
    const value = input.trim();
    if (!value) return { value: null, error: "用户名不能为空" };
    if (/[\r\n]/.test(value)) return { value, error: "用户名不能包含换行" };
    if (codePointLength(value) > NICKNAME_MAX) {
        return { value, error: `用户名不能超过 ${NICKNAME_MAX} 个字` };
    }
    return { value, error: null };
}

/** 个人简介：可清空；统一换行符，去首尾空白，最多 200 个字。 */
export function checkBio(input: string): FieldCheck {
    const value = input.replace(/\r\n?/g, "\n").trim();
    if (!value) return { value: null, error: null };
    if (codePointLength(value) > BIO_MAX) {
        return { value, error: `个人简介不能超过 ${BIO_MAX} 个字` };
    }
    return { value, error: null };
}

/** 自定义性别：去首尾空白，1–20 个字，不含换行。 */
export function checkGenderCustom(input: string): FieldCheck {
    const value = input.trim();
    if (!value) return { value: null, error: "请填写自定义性别" };
    if (/[\r\n]/.test(value)) return { value, error: "自定义性别不能包含换行" };
    if (codePointLength(value) > GENDER_CUSTOM_MAX) {
        return { value, error: `自定义性别不能超过 ${GENDER_CUSTOM_MAX} 个字` };
    }
    return { value, error: null };
}

export function formatGender(
    gender: UserGender | null | undefined,
    custom: string | null | undefined,
): string {
    if (gender === "male") return "男";
    if (gender === "female") return "女";
    if (gender === "custom" && custom?.trim()) return custom.trim();
    return "不设置";
}

/** created_at 可能为空或无法解析；返回 null 时由界面显示“暂不可用”。 */
export function parseCreatedAt(value: string | null | undefined): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

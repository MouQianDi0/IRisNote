import type { UserGender } from "@/shared/types/user";

/** 与服务端一致的长度上限，按 Unicode 码点计数。 */
export const NICKNAME_MAX = 30;
export const BIO_MAX = 200;

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

/** 未知取值（如旧缓存中的历史值）按“不设置”显示。 */
export function formatGender(gender: UserGender | null | undefined): string {
    if (gender === "male") return "男";
    if (gender === "female") return "女";
    return "不设置";
}

/** created_at 可能为空或无法解析；返回 null 时由界面显示“暂不可用”。 */
export function parseCreatedAt(value: string | null | undefined): Date | null {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

/** 保留首字符与域名，其余本地部分用星号代替。 */
export function maskEmail(email: string): string {
    const at = email.lastIndexOf("@");
    if (at <= 0) return email;
    return `${email[0]}***${email.slice(at)}`;
}

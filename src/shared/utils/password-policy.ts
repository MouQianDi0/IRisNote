/** 与服务端一致：设置新密码（注册、修改、重设）时 6–64 个字符，且不超过 72 字节。 */
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 64;
/** bcrypt 只使用前 72 字节，超出部分会被忽略。 */
export const PASSWORD_MAX_BYTES = 72;
export const PASSWORD_HINT = `${PASSWORD_MIN}–${PASSWORD_MAX} 个字符`;

function utf8Length(value: string): number {
    let bytes = 0;
    for (const char of value) {
        const code = char.codePointAt(0) ?? 0;
        bytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
    }
    return bytes;
}

/** 返回错误文案；合规时返回 null。首尾空格属于密码本身，不做去除。 */
export function checkNewPassword(password: string): string | null {
    if (!password) return "请输入密码";
    const length = [...password].length;
    if (length < PASSWORD_MIN || length > PASSWORD_MAX) {
        return `密码长度需为 ${PASSWORD_HINT}`;
    }
    if (utf8Length(password) > PASSWORD_MAX_BYTES) {
        return "密码过长，请减少中文或特殊符号";
    }
    return null;
}

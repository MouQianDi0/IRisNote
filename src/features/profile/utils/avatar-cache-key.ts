/** 与服务端上传命名一致：`<用户ID>_<13 位毫秒时间戳>.<扩展名>`。 */
const AVATAR_FILE_PATTERN = /^([1-9]\d*)_(\d{13})\.(jpg|png|gif|webp)$/;

export const AVATAR_CACHE_MAX_BYTES = 2 * 1024 * 1024;

const ascii = (bytes: Uint8Array, start: number, end: number) =>
    String.fromCharCode(...bytes.subarray(start, end));

/** 按文件头判断是否为 JPEG/PNG/GIF/WEBP，防止把错误页面等内容当作头像缓存。 */
export function looksLikeAvatarImage(bytes: Uint8Array): boolean {
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
        return true;
    }
    if (
        bytes.length >= 8 &&
        [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
            (value, index) => bytes[index] === value,
        )
    ) {
        return true;
    }
    if (bytes.length >= 6 && ["GIF87a", "GIF89a"].includes(ascii(bytes, 0, 6))) {
        return true;
    }
    return (
        bytes.length >= 12 &&
        ascii(bytes, 0, 4) === "RIFF" &&
        ascii(bytes, 8, 12) === "WEBP"
    );
}

/** 头像地址的文件名；只有属于该用户且命名合规时才允许写入本地缓存。 */
export function cacheableAvatarName(
    avatarUrl: string | null | undefined,
    userId: number,
): string | null {
    if (!avatarUrl || !/^https?:\/\//i.test(avatarUrl)) return null;
    const path = avatarUrl.split(/[?#]/, 1)[0];
    const name = path.slice(path.lastIndexOf("/") + 1);
    const match = AVATAR_FILE_PATTERN.exec(name);
    if (!match || Number(match[1]) !== userId) return null;
    return name;
}

/** 去掉 data URI 前缀，得到可写入文件的 base64 内容。 */
export function base64FromDataUri(dataUri: string): string | null {
    const match = /^data:image\/[\w+.-]+;base64,(.+)$/s.exec(dataUri);
    return match ? match[1] : null;
}

export type AvatarDisplaySource = { uri: string; from: "local" | "remote" };

/** 本地缓存优先；没有缓存时仅在允许联网的情况下使用远程地址。 */
export function chooseAvatarSource(options: {
    localUri: string | null;
    remoteUri: string | null;
    networkAllowed: boolean;
}): AvatarDisplaySource | null {
    if (options.localUri) return { uri: options.localUri, from: "local" };
    if (!options.remoteUri) return null;
    const isNetwork = /^https?:\/\//i.test(options.remoteUri);
    if (isNetwork && !options.networkAllowed) return null;
    return { uri: options.remoteUri, from: "remote" };
}

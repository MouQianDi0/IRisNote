export function createAvatarDataUri(
    base64: string,
    mimeType = "image/jpeg",
): string {
    if (base64.startsWith("data:")) return base64;
    return `data:${mimeType};base64,${base64}`;
}

export function estimateJsonBytes(value: unknown) {
    const json = JSON.stringify(value);
    if (typeof TextEncoder !== "undefined") {
        return new TextEncoder().encode(json).byteLength;
    }
    return encodeURIComponent(json).replace(/%[0-9A-F]{2}|./gi, "x").length;
}

export function formatUploadBytes(bytes: number) {
    if (bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

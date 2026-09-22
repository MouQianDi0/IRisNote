export type CleanupSelection = {
    updates: boolean;
    shares: boolean;
    notes: boolean;
};
export const defaultCleanupSelection = (): CleanupSelection => ({
    updates: true,
    shares: true,
    notes: false,
});
export const SHARE_RETENTION_MS = 24 * 60 * 60 * 1000;

export function installedUpdateFile(
    name: string,
    installed: string | null,
): boolean {
    if (!installed || !/^[1-9]\d*$/.test(installed)) return false;
    const current = Number(installed);
    if (String(current) !== installed) return false;
    const match = /^irisnote-release-([1-9]\d*)\.(apk|hdiff)$/.exec(name);
    if (!match || match[0] !== name || !Number.isSafeInteger(current))
        return false;
    const version = Number(match[1]);
    return Number.isSafeInteger(version) && version <= current;
}

export function expiredShareFile(
    name: string,
    modified: number | null,
    now = Date.now(),
): boolean {
    return (
        /^share-[a-z0-9-]+\.(txt|md|pdf|png)$/.test(name) &&
        modified !== null &&
        Number.isFinite(modified) &&
        modified > 0 &&
        now - modified >= SHARE_RETENTION_MS
    );
}

export function formatStorageBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) return "暂未统计";
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${Math.ceil(bytes)} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let amount = bytes / 1024,
        index = 0;
    while (amount >= 1024 && index < units.length - 1) {
        amount /= 1024;
        index++;
    }
    return `${amount.toFixed(1)} ${units[index]}`;
}

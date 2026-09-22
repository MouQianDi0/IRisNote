import type { ReadingPosition, ReadingRecord } from "./reading-position";
/** Contract only: no endpoint is invented or called until a backend is available. */
export type CloudReadingRecord = ReadingPosition & {
    serverVersion: string;
    updatedAt: number;
};
export interface ReadingProgressTransport {
    read(
        serverNoteId: number,
        signal: AbortSignal,
    ): Promise<CloudReadingRecord | null>;
    write(
        serverNoteId: number,
        request: {
            position: ReadingPosition;
            expectedServerVersion: string | null;
            mutationId: string;
        },
        signal: AbortSignal,
    ): Promise<
        | { status: "saved"; record: CloudReadingRecord }
        | { status: "conflict"; record: CloudReadingRecord }
    >;
}
export function canUploadReadingRecord(record: ReadingRecord) {
    return (
        record.pendingSync &&
        record.serverId !== null &&
        Number.isInteger(record.serverId) &&
        record.serverId > 0
    );
}
/** Conflict responses must not cause automatic overwrite by stale offline progress. */
export function canApplyCloudRestore(
    local: ReadingRecord | null,
    userInteracted: boolean,
) {
    return !userInteracted && !local?.pendingSync;
}
export const READING_CLOUD_STATUS = "unavailable" as const;

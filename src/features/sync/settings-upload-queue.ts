import type { ApplicationDatabase } from "@/core/database";
import { enqueueUploadTask, estimateJsonBytes } from "@/core/sync";

/** Settings services call this after registering a settings-sync task adapter. */
export function enqueueSettingsUpload(
    database: ApplicationDatabase,
    ownerUserId: number,
    input: {
        dedupeKey: string;
        title: string;
        payload: Record<string, unknown>;
    },
) {
    return enqueueUploadTask(database, {
        ownerUserId,
        kind: "settings-sync",
        dedupeKey: `settings:${input.dedupeKey}`,
        title: input.title,
        operationLabel: "更新设置",
        payload: input.payload,
        estimatedBytes: estimateJsonBytes(input.payload),
    });
}

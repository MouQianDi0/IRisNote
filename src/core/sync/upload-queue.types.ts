export type UploadTaskKind =
    | "note-sync"
    | "category-create"
    | "category-update"
    | "category-delete"
    | "settings-sync";

export type UploadTaskStatus = "queued" | "running" | "paused" | "blocked";

export type UploadQueueTask = {
    taskId: string;
    ownerUserId: number;
    kind: UploadTaskKind;
    dedupeKey: string;
    title: string;
    operationLabel: string;
    payload: Record<string, unknown>;
    status: UploadTaskStatus;
    attemptCount: number;
    estimatedBytes: number;
    transferredBytes: number;
    lastError: string | null;
    createdAt: string;
    updatedAt: string;
};

export type EnqueueUploadTask = Pick<
    UploadQueueTask,
    | "ownerUserId"
    | "kind"
    | "dedupeKey"
    | "title"
    | "operationLabel"
    | "payload"
    | "estimatedBytes"
>;

export type UploadQueueSummary = {
    count: number;
    estimatedBytes: number;
    transferredBytes: number;
};

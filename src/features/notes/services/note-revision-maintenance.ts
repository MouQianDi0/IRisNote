import type { ApplicationDatabase } from "@/core/database";
import { recordDiagnostic } from "@/core/diagnostics/diagnostic-log";
import { pruneAllNoteRevisions } from "../data/note-revision-retention";

/** 比临时文件清理晚一些，避免两个维护任务同时占用存储。 */
export const NOTE_REVISION_MAINTENANCE_DELAY_MS = 20_000;

let scheduled = false;

/**
 * 每个进程只安排一次：裁剪超出上限的历史版本。保存时已顺带裁剪，
 * 这里主要处理升级前积累的存量；失败只记诊断，下次启动再试。
 */
export function scheduleNoteRevisionRetention(
    database: ApplicationDatabase,
    delayMs = NOTE_REVISION_MAINTENANCE_DELAY_MS,
) {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
        void pruneAllNoteRevisions(database).then(
            (removed) => {
                if (removed)
                    void recordDiagnostic("notes", "revision_retention", {
                        removed,
                    });
            },
            () =>
                void recordDiagnostic(
                    "notes",
                    "revision_retention_failed",
                    undefined,
                    "warning",
                ),
        );
    }, delayMs);
}

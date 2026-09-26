import { useApplicationDatabase } from "@/core/database";
import { scheduleStartupCacheCleanup } from "@/core/storage/auto-cleanup";
import { scheduleNoteRevisionRetention } from "@/features/notes/services/note-revision-maintenance";
import { useEffect } from "react";

/** 启动后的本地数据维护：清理临时文件、裁剪超出上限的历史版本。各任务每个进程只执行一次。 */
export function StartupMaintenance() {
    const database = useApplicationDatabase();
    useEffect(() => scheduleStartupCacheCleanup(), []);
    useEffect(() => scheduleNoteRevisionRetention(database), [database]);
    return null;
}

import { recordDiagnostic } from "@/core/diagnostics/diagnostic-log";
import { clearStorageFiles, scanCacheCleanupCandidates } from "./storage-files";

/** 启动后延迟执行，避免与首屏加载、更新检查争用。 */
export const STARTUP_CLEANUP_DELAY_MS = 15_000;

/**
 * 清理已安装版本及更旧的更新包、结束使用满 24 小时的分享文件。
 * 规则与「数据与存储」页的手动清理相同；笔记缓存需要联网核实，不在自动清理之列。
 */
export async function runCacheCleanup() {
    const scan = scanCacheCleanupCandidates();
    if (!scan.cleanable.updates && !scan.cleanable.shares) return null;
    return clearStorageFiles(
        scan,
        { updates: true, shares: true, notes: false, diagnostics: false },
        () => {},
    );
}

let scheduled = false;

/** 每次进程启动只安排一次；失败只记诊断，不打扰用户。 */
export function scheduleStartupCacheCleanup(
    delayMs = STARTUP_CLEANUP_DELAY_MS,
) {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
        void runCacheCleanup().then(
            (result) => {
                if (!result) return;
                void recordDiagnostic("storage", "auto_cleanup", {
                    released: result.released,
                    failed: result.failed,
                    skipped: result.skipped,
                });
            },
            () =>
                void recordDiagnostic(
                    "storage",
                    "auto_cleanup_failed",
                    undefined,
                    "warning",
                ),
        );
    }, delayMs);
}

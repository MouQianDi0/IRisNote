import type { ApplicationDatabase } from "@/core/database";
import { captureCloudStorageAccess, isCloudStoragePermissionError, subscribeCloudStorage } from "@/core/cloud-storage/cloud-storage-policy";
import {
    banner,
    captureNotificationSession,
    isServerConnectionBannerSuppressed,
    onServerConnectionBannerSuppressionChanged,
} from "@/core/notifications";
import * as Network from "expo-network";
import { onUploadQueueChanged } from "./upload-queue.events";
import {
    completeUploadTask,
    listUploadTasks,
    markUploadTaskRetry,
    markUploadTaskRunning,
    pauseUploadTask,
    readUploadQueueSummary,
    recoverInterruptedUploadTasks,
    resumePausedUploadTasks,
} from "./upload-queue.repository";
import { updateUploadQueueRuntime } from "./upload-queue.runtime";
import type { UploadQueueTask } from "./upload-queue.types";
import { formatUploadBytes } from "./upload-queue.utils";

type Execution = {
    state: "accepted" | "retry" | "blocked" | "suspended";
    message?: string;
    transferredBytes: number;
};

type Options = {
    database: ApplicationDatabase;
    ownerUserId: number;
    probe: (signal: AbortSignal) => Promise<unknown>;
    execute: (task: UploadQueueTask) => Promise<Execution>;
    openQueue: () => void;
    openNetworkSettings: () => Promise<void>;
};

const MAX_ATTEMPTS = 10;
const wait = (ms: number, signal: AbortSignal) => new Promise<void>((resolve) => {
    const done = () => { clearTimeout(timer); signal.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal.addEventListener("abort", done, { once: true });
    if (signal.aborted) done();
});
// A newly authorized session waits for the previous session's receipts/bookkeeping.
const flushes = new WeakMap<ApplicationDatabase, Map<number, Promise<void>>>();
const usable = (state: Network.NetworkState) =>
    state.isConnected === true && state.isInternetReachable !== false;

const showOrUpdateBanner = (
    id: string,
    content: Parameters<typeof banner.show>[0],
) => {
    if (!banner.update(id, content)) banner.show({ ...content, id });
};

export function startUploadQueueCoordinator(options: Options) {
    const checkPermission = captureCloudStorageAccess(options.ownerUserId);
    const allowed = () => { try { checkPermission(); return true; } catch { return false; } };
    const lifetime = new AbortController();
    const permissionSubscription = subscribeCloudStorage(() => {
        if (!allowed()) lifetime.abort();
    });
    let initialized = false;
    let active = true;
    let stopped = false;
    let processing = false;
    let networkState: Network.NetworkState = {
        type: Network.NetworkStateType.UNKNOWN,
        isConnected: false,
        isInternetReachable: false,
    };
    let sawOffline = false;
    let probeController: AbortController | null = null;
    lifetime.signal.addEventListener("abort", () => probeController?.abort());

    const showPaused = async (message: string) => {
        const summary = await readUploadQueueSummary(options.database, options.ownerUserId);
        if (stopped || !allowed()) return;
        showOrUpdateBanner("upload-queue-paused", {
            id: "upload-queue-paused",
            type: "important",
            priority: "critical",
            icon: "cloud-off",
            title: "暂存上传已暂停",
            message: `${message}；${summary.count} 项暂存任务，预计 ${formatUploadBytes(summary.estimatedBytes)}`,
            lifetime: { mode: "until-resolved" },
            action: {
                label: "网络设置",
                onPress: options.openNetworkSettings,
            },
            bodyAction: { label: "查看暂存", onPress: options.openQueue },
        });
    };

    const showBlocked = async (message: string) => {
        const summary = await readUploadQueueSummary(options.database, options.ownerUserId);
        if (stopped || !allowed()) return;
        showOrUpdateBanner("upload-queue-blocked", {
            id: "upload-queue-blocked",
            type: "important",
            priority: "critical",
            icon: "cloud-off",
            title: "暂存任务需要处理",
            message: `${message}；任务已保留在本机，共 ${summary.count} 项`,
            lifetime: { mode: "until-resolved" },
            action: { label: "查看暂存", onPress: options.openQueue },
        });
    };

    const showOfflineQueue = async () => {
        const summary = await readUploadQueueSummary(options.database, options.ownerUserId);
        if (
            !summary.count ||
            stopped ||
            !allowed() ||
            usable(networkState) ||
            isServerConnectionBannerSuppressed()
        ) return;
        showOrUpdateBanner("server-connection", {
            id: "server-connection",
            type: "important",
            priority: "critical",
            icon: "cloud-off",
            title: "无法连接服务器，正在重连",
            message: `${summary.count} 项暂存任务 · 预计上传 ${formatUploadBytes(summary.estimatedBytes)}`,
            lifetime: { mode: "until-resolved" },
            action: { label: "查看暂存", onPress: options.openQueue },
        });
    };

    const flush = async () => {
        if (!initialized || stopped || !allowed() || !active || processing || !usable(networkState)) return;
        let owners = flushes.get(options.database);
        if (!owners) { owners = new Map(); flushes.set(options.database, owners); }
        if (owners.has(options.ownerUserId)) return;
        let release = () => {};
        const pending = new Promise<void>((resolve) => { release = resolve; });
        owners.set(options.ownerUserId, pending);
        processing = true;
        updateUploadQueueRuntime({ running: true, server: "checking" });
        const sessionCurrent = captureNotificationSession();
        probeController?.abort();
        const controller = new AbortController();
        probeController = controller;
        try {
            await options.probe(controller.signal);
            if (stopped || !allowed() || !active || !sessionCurrent()) return;
            updateUploadQueueRuntime({ server: "available" });
            banner.resolve("server-connection", {
                type: "success",
                title: "服务器连接已恢复",
                lifetime: { mode: "timed", durationMs: 3000 },
            });
            const initial = await readUploadQueueSummary(options.database, options.ownerUserId);
            if (!initial.count) return;
            let completedCount = 0;
            let completedBytes = 0;

            while (!stopped && allowed() && active && usable(networkState)) {
                const task = (await listUploadTasks(options.database, options.ownerUserId))
                    .find((item) => item.status === "queued");
                if (!task || !allowed() || stopped) break;
                let finished = false;
                if (task.attemptCount >= MAX_ATTEMPTS) {
                    await pauseUploadTask(
                        options.database,
                        task.taskId,
                        "paused",
                        task.lastError ?? "连续重试 10 次仍未成功",
                    );
                    await showPaused("已连续重试 10 次，请检查本机网络状态");
                    continue;
                }
                for (let attempt = task.attemptCount + 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
                    if (stopped || !allowed() || !active || !usable(networkState)) break;
                    const claimed = await markUploadTaskRunning(
                        options.database,
                        task.taskId,
                    );
                    if (!claimed) {
                        finished = true;
                        break;
                    }
                    showOrUpdateBanner("upload-queue-sync", {
                        id: "upload-queue-sync",
                        type: "special",
                        title: "网络已恢复，正在同步暂存任务",
                        message: `${completedCount + 1}/${initial.count} · ${task.operationLabel} · 第 ${attempt}/${MAX_ATTEMPTS} 次`,
                        lifetime: { mode: "persistent" },
                        progress: {
                            mode: "determinate",
                            value: Math.min(1, completedCount / Math.max(1, initial.count)),
                        },
                    });
                    let result: Execution;
                    try {
                        checkPermission();
                        result = await options.execute(task);
                    } catch (error) {
                        const message = error instanceof Error ? error.message : "上传任务执行失败";
                        result = {
                            state: isCloudStoragePermissionError(error) ? "suspended" : message.startsWith("[Upload queue]") ? "blocked" : "retry",
                            message,
                            transferredBytes: task.estimatedBytes,
                        };
                    }
                    if (result.state === "accepted") {
                        await completeUploadTask(options.database, task.taskId);
                        completedCount += 1;
                        completedBytes += result.transferredBytes;
                        finished = true;
                        break;
                    }
                    if (result.state === "blocked") {
                        await pauseUploadTask(
                            options.database,
                            task.taskId,
                            "blocked",
                            result.message ?? "云端明确拒绝或创建结果未知",
                        );
                        await showBlocked(result.message ?? "任务需要检查后才能继续");
                        finished = true;
                        break;
                    }
                    if (stopped || !allowed()) {
                        await markUploadTaskRetry(options.database, task.taskId, 0, "云存储已暂停，任务保留在本机");
                        finished = true;
                        break;
                    }
                    if (result.state === "suspended" || !allowed() || stopped) {
                        await markUploadTaskRetry(options.database, task.taskId, 0, "云存储已暂停，任务保留在本机");
                        finished = true;
                        break;
                    }
                    await markUploadTaskRetry(
                        options.database,
                        task.taskId,
                        result.transferredBytes,
                        result.message ?? "云同步失败",
                    );
                    if (attempt >= MAX_ATTEMPTS) {
                        await pauseUploadTask(
                            options.database,
                            task.taskId,
                            "paused",
                            result.message ?? "连续重试 10 次仍未成功",
                        );
                        await showPaused("已连续重试 10 次，请检查本机网络状态");
                        finished = true;
                        break;
                    }
                    showOrUpdateBanner("upload-queue-sync", {
                        id: "upload-queue-sync",
                        type: "important",
                        title: "云同步失败，正在自动重试",
                        message: `${task.operationLabel} · 第 ${attempt}/${MAX_ATTEMPTS} 次失败`,
                        lifetime: { mode: "persistent" },
                    });
                    await wait(Math.min(30000, 1000 * 2 ** Math.min(attempt - 1, 5)), lifetime.signal);
                }
                if (!finished) break;
            }

            if (completedCount > 0 && allowed() && !stopped && sessionCurrent()) {
                banner.resolve("upload-queue-sync", {
                    type: "success",
                    icon: "check",
                    title: "网络恢复，暂存任务执行成功",
                    message: `${completedCount} 项 · 已上传 ${formatUploadBytes(completedBytes)}`,
                    lifetime: { mode: "timed", durationMs: 4000 },
                });
            }
        } catch {
            if (allowed() && !stopped) updateUploadQueueRuntime({ server: "unavailable" });
        } finally {
            if (probeController === controller) probeController = null;
            processing = false;
            updateUploadQueueRuntime({ running: false });
            if (owners.get(options.ownerUserId) === pending) owners.delete(options.ownerUserId);
            release();
        }
    };

    const handleNetwork = (state: Network.NetworkState) => {
        if (stopped || !allowed()) return;
        const wasUsable = usable(networkState);
        networkState = state;
        const isUsable = usable(state);
        updateUploadQueueRuntime({
            networkType: state.type ?? Network.NetworkStateType.UNKNOWN,
            connected: isUsable,
            ...(!isUsable ? { server: "unknown" as const } : {}),
        });
        if (!isUsable) {
            sawOffline = true;
            probeController?.abort();
            void showOfflineQueue();
            return;
        }
        if (sawOffline && !wasUsable) {
            sawOffline = false;
            void resumePausedUploadTasks(options.database, options.ownerUserId).then(() => {
                if (stopped || !allowed()) return;
                banner.resolve("upload-queue-paused", {
                    type: "special",
                    title: "网络已恢复，准备重试暂存任务",
                    lifetime: { mode: "timed", durationMs: 3000 },
                });
                return flush();
            });
            return;
        }
        void flush();
    };

    void (async () => {
        await flushes.get(options.database)?.get(options.ownerUserId);
        if (stopped || !allowed()) return;
        await recoverInterruptedUploadTasks(options.database, options.ownerUserId);
        if (stopped || !allowed()) return;
        initialized = true;
        handleNetwork(await Network.getNetworkStateAsync());
    })().catch((error) => {
        if (allowed() && !stopped) console.warn("[Upload queue] 初始化失败", error);
    });
    const networkSubscription = Network.addNetworkStateListener(handleNetwork);
    const queueSubscription = onUploadQueueChanged(() => {
        if (usable(networkState)) void flush();
        else void showOfflineQueue();
    });
    const suppressionSubscription =
        onServerConnectionBannerSuppressionChanged((suppressed) => {
            if (!suppressed) void showOfflineQueue();
        });

    return {
        setActive(value: boolean) {
            active = value;
            if (!active) probeController?.abort();
            else void flush();
        },
        stop() {
            stopped = true;
            lifetime.abort();
            permissionSubscription();
            probeController?.abort();
            networkSubscription.remove();
            queueSubscription();
            suppressionSubscription();
            updateUploadQueueRuntime({ running: false, server: "unknown" });
        },
    };
}

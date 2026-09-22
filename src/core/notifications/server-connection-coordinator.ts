import {
    onConnectionEvent,
    onConnectionReset,
} from "@/shared/http/connection-events";
import {
    banner,
    captureNotificationSession,
    notificationStore,
} from "./notification.service";
import {
    isServerConnectionBannerSuppressed,
    onServerConnectionBannerSuppressionChanged,
    SERVER_CONNECTION_BANNER_ID,
} from "./server-connection-banner-visibility";

const id = SERVER_CONNECTION_BANNER_ID;
export function isServerConnectionUnavailable() {
    return notificationStore
        .getSnapshot()
        .some(
            (item) => item.id === id && item.lifetime.mode === "until-resolved",
        );
}
/** A single read-only probe, exponential retry, and no automatic write replay. */
export function startConnectionCoordinator(
    probe: (signal: AbortSignal) => Promise<unknown>,
    options?: {
        getPendingSummary?: () => Promise<{
            count: number;
            estimatedBytes: number;
        }>;
        openQueue?: () => void;
    },
) {
    let latest = 0;
    let failures = 0;
    let fault = false;
    let active = true;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let request: AbortController | undefined;
    const formatBytes = (bytes: number) =>
        bytes < 1024
            ? `${Math.max(0, Math.round(bytes))} B`
            : bytes < 1024 * 1024
              ? `${(bytes / 1024).toFixed(1)} KB`
              : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    const cancel = () => {
        clearTimeout(timer);
        timer = undefined;
        request?.abort();
        request = undefined;
    };
    const schedule = () => {
        if (stopped || !active || timer || request || !failures) return;
        timer = setTimeout(
            () => {
                timer = undefined;
                void retry();
            },
            Math.min(30000, 2000 * 2 ** Math.min(attempt++, 4)),
        );
    };
    const retry = async () => {
        if (!active || request || stopped) return;
        clearTimeout(timer);
        timer = undefined;
        const controller = new AbortController();
        request = controller;
        const current = captureNotificationSession();
        try {
            await probe(controller.signal);
        } catch {
            /* HTTP events classify the outcome. */
        } finally {
            if (current() && request === controller) {
                request = undefined;
                schedule();
            }
        }
    };
    const publishFault = async () => {
        const summary = await options
            ?.getPendingSummary?.()
            .catch(() => undefined);
        if (
            !active ||
            stopped ||
            !fault ||
            isServerConnectionBannerSuppressed()
        )
            return;
        const hasPending = Boolean(summary?.count);
        const content = {
            title: "无法连接服务器，正在重连",
            message: hasPending
                ? `${summary!.count} 项暂存任务 · 预计上传 ${formatBytes(summary!.estimatedBytes)}`
                : undefined,
            type: "important" as const,
            priority: "critical" as const,
            lifetime: { mode: "until-resolved" as const },
            icon: "cloud-off" as const,
            action:
                hasPending && options?.openQueue
                    ? { label: "查看暂存", onPress: options.openQueue }
                    : { label: "重试", onPress: retry },
        };
        if (!banner.update(id, content)) banner.show({ id, ...content });
    };
    const remove = onConnectionEvent((event) => {
        if (event.sequence < latest || stopped) return;
        latest = event.sequence;
        if (event.outcome === "success") {
            failures = 0;
            attempt = 0;
            clearTimeout(timer);
            timer = undefined;
            if (fault)
                banner.resolve(id, {
                    type: "success",
                    title: "服务器连接已恢复",
                });
            fault = false;
            return;
        }
        if (event.outcome === "reachable") {
            failures = 0;
            clearTimeout(timer);
            timer = undefined;
            if (fault)
                banner.resolve(id, {
                    type: "important",
                    title: "服务器已响应，请检查当前请求状态",
                    message: "连接已建立，请检查登录、权限或页面错误提示",
                    lifetime: { mode: "persistent" },
                });
            fault = false;
            return;
        }
        failures++;
        if (failures >= 2) {
            fault = true;
            void publishFault();
        }
        schedule();
    });
    const releaseSuppressionListener =
        onServerConnectionBannerSuppressionChanged((suppressed) => {
            if (!suppressed && fault) void publishFault();
        });
    const reset = onConnectionReset(() => {
        cancel();
        failures = 0;
        fault = false;
        latest = 0;
        attempt = 0;
    });
    return {
        setActive(value: boolean) {
            active = value;
            if (!active) cancel();
            else schedule();
        },
        stop() {
            stopped = true;
            cancel();
            remove();
            reset();
            releaseSuppressionListener();
        },
    };
}

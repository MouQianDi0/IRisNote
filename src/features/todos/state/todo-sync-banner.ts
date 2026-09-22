import type { BannerOptions } from "@/core/notifications/notification.types";
import type { TodoSyncResult } from "../services/todo-sync.service";

export function todoSyncBanner(
    result: TodoSyncResult,
    openQueue: () => void,
): BannerOptions | null {
    if (result.pending)
        return {
            id: "todo-cloud-sync",
            title: "待办尚未全部同步",
            message: `${result.pending} 项本地修改已保留，可在同步队列查看或处理冲突`,
            type: "important",
            icon: "warning",
            priority: "high",
            lifetime: { mode: "persistent" },
            action: { label: "查看待办同步", onPress: openQueue },
        };
    if (!result.uploaded) return null;
    return {
        id: "todo-cloud-sync",
        title: "待办已同步",
        message: `已将 ${result.uploaded} 项修改上传到云端`,
        type: "success",
        icon: "check",
        priority: "normal",
        lifetime: { mode: "timed", durationMs: 4000 },
        action: undefined,
    };
}

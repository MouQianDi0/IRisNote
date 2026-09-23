import {
    diagnosticErrorCategory,
    recordDiagnostic,
} from "@/core/diagnostics";
import type { TodoEntity } from "../todos.types";
import {
    desiredTodoLiveUpdates,
    type TodoLiveUpdateCard,
} from "../services/todo-live-update.service";

export type TodoLiveUpdatePort = {
    /** Android 16（API 36）进度式通知是否可用。 */
    supported(): boolean;
    /** 系统通知权限是否已授予；读取失败按未授予处理。 */
    permissionGranted(): Promise<boolean>;
    post(card: TodoLiveUpdateCard): Promise<void>;
    cancel(notificationId: number): Promise<void>;
};

export type TodoLiveUpdateSnapshot = {
    ownerKey: string | null;
    ready: boolean;
    entities: readonly TodoEntity[];
};

/**
 * 待办动态进度卡片协调器（仅前台）：
 * - refresh 按最新快照与权限做差量——新增发卡片、有变化原位更新、消失撤卡片；
 * - start 后每 30 秒例行刷新（进度分钟级变化）；
 * - stop 撤下全部卡片（应用退后台/Provider 卸载时调用，避免冻结的过期进度）。
 * 单轮 refresh 串行；并发请求合并复用同一轮。
 */
export class TodoLiveUpdateCoordinator {
    private cards = new Map<number, TodoLiveUpdateCard>();
    private pending: Promise<void> | null = null;
    private interval: ReturnType<typeof setInterval> | null = null;
    constructor(
        private readonly port: TodoLiveUpdatePort,
        private readonly snapshot: () => TodoLiveUpdateSnapshot,
        private readonly now = () => new Date(),
    ) {}

    async start(): Promise<void> {
        if (!this.port.supported()) return;
        if (this.interval) {
            await this.refresh();
            return;
        }
        this.interval = setInterval(() => void this.refresh(), 30_000);
        void recordDiagnostic("live_update", "coordinator_started");
        await this.refresh();
    }

    async stop(): Promise<void> {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        if (this.cards.size === 0) return;
        const ids = [...this.cards.keys()];
        this.cards.clear();
        for (const id of ids) {
            try {
                await this.port.cancel(id);
            } catch (cause) {
                void recordDiagnostic(
                    "live_update",
                    "card_cancel_failed",
                    { notification: id, error: diagnosticErrorCategory(cause) },
                    "error",
                );
            }
        }
        void recordDiagnostic("live_update", "coordinator_stopped", {
            removed: ids.length,
        });
    }

    refresh(): Promise<void> {
        if (!this.port.supported()) return Promise.resolve();
        if (this.pending) return this.pending;
        const pending = this.run();
        this.pending = pending;
        void pending.then(
            () => {
                this.pending = null;
            },
            () => {
                this.pending = null;
            },
        );
        return pending;
    }

    private async run(): Promise<void> {
        let granted: boolean;
        try {
            granted = await this.port.permissionGranted();
        } catch (cause) {
            void recordDiagnostic(
                "live_update",
                "permission_read_failed",
                { error: diagnosticErrorCategory(cause) },
                "error",
            );
            return;
        }
        const current = this.snapshot();
        const desired =
            granted && current.ready && current.ownerKey
                ? desiredTodoLiveUpdates(current.entities, this.now())
                : [];
        const desiredMap = new Map(
            desired.map((card) => [card.notificationId, card]),
        );
        for (const id of [...this.cards.keys()]) {
            if (desiredMap.has(id)) continue;
            this.cards.delete(id);
            try {
                await this.port.cancel(id);
                void recordDiagnostic("live_update", "card_removed", {
                    notification: id,
                });
            } catch (cause) {
                void recordDiagnostic(
                    "live_update",
                    "card_cancel_failed",
                    { notification: id, error: diagnosticErrorCategory(cause) },
                    "error",
                );
            }
        }
        for (const card of desired) {
            const previous = this.cards.get(card.notificationId);
            if (
                previous &&
                previous.text === card.text &&
                previous.progress === card.progress &&
                previous.indeterminate === card.indeterminate
            )
                continue;
            try {
                await this.port.post(card);
                this.cards.set(card.notificationId, card);
                void recordDiagnostic(
                    "live_update",
                    previous ? "card_updated" : "card_posted",
                    { notification: card.notificationId },
                );
            } catch (cause) {
                void recordDiagnostic(
                    "live_update",
                    "card_post_failed",
                    {
                        notification: card.notificationId,
                        error: diagnosticErrorCategory(cause),
                    },
                    "error",
                );
            }
        }
    }
}

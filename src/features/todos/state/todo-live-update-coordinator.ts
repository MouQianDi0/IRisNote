import {
    diagnosticErrorCategory,
    recordDiagnostic,
} from "@/core/diagnostics";
import type { TodoEntity } from "../todos.types";
import {
    desiredTodoLiveUpdates,
    type TodoLiveUpdateCard,
} from "../services/todo-live-update.service";

/** card_updated 诊断采样下限：同卡两次"原位更新"记录的最短间隔。 */
const CARD_UPDATE_DIAGNOSTIC_INTERVAL_MS = 5 * 60_000;

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
 * 竞态防护：每次 stop 递增 epoch，进行中的 run() 在每个 await 恢复点发现代数
 * 过期即中止——保证"stop 之后不再有本代卡片残留/重发"；refresh 另有 active 门
 * （stop 后由仓库订阅触发的刷新直接跳过）。
 */
export class TodoLiveUpdateCoordinator {
    private cards = new Map<number, TodoLiveUpdateCard>();
    private pending: Promise<void> | null = null;
    private interval: ReturnType<typeof setInterval> | null = null;
    private epoch = 0;
    private lastUpdateDiagnosticAt = new Map<number, number>();
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
        this.epoch += 1;
        this.pending = null;
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
        if (!this.interval) return Promise.resolve();
        if (this.pending) return this.pending;
        const pending = this.run();
        this.pending = pending;
        void pending.then(
            () => {
                if (this.pending === pending) this.pending = null;
            },
            () => {
                if (this.pending === pending) this.pending = null;
            },
        );
        return pending;
    }

    private async run(): Promise<void> {
        const epoch = this.epoch;
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
        if (epoch !== this.epoch) return;
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
            this.lastUpdateDiagnosticAt.delete(id);
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
            if (epoch !== this.epoch) return;
        }
        for (const card of desired) {
            const previous = this.cards.get(card.notificationId);
            if (previous && this.cardEquals(previous, card)) continue;
            try {
                await this.port.post(card);
                if (epoch !== this.epoch) {
                    // stop() 已并发执行：本卡未被 stop 撤除。若新一轮 refresh
                    // 尚未重新认领（cards 无此 ID），补撤以免残留；否则让新代管理。
                    if (!this.cards.has(card.notificationId)) {
                        try {
                            await this.port.cancel(card.notificationId);
                        } catch {
                            // 补撤失败不再记录：cancel 失败诊断已由端口实现记录
                        }
                    }
                    return;
                }
                this.cards.set(card.notificationId, card);
                this.recordCardPostedOrUpdated(card.notificationId, !!previous);
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

    /** 卡片内容等价判定：任何用户可见字段（标题/正文/进度/总量/形态）变化都触发原位更新。 */
    private cardEquals(
        previous: TodoLiveUpdateCard,
        card: TodoLiveUpdateCard,
    ): boolean {
        return (
            previous.title === card.title &&
            previous.text === card.text &&
            previous.progress === card.progress &&
            previous.max === card.max &&
            previous.indeterminate === card.indeterminate
        );
    }

    /** card_posted 全量记录；card_updated 按卡采样降频，避免分钟级节律冲刷诊断窗口。 */
    private recordCardPostedOrUpdated(
        notificationId: number,
        updated: boolean,
    ): void {
        if (!updated) {
            this.lastUpdateDiagnosticAt.delete(notificationId);
            void recordDiagnostic("live_update", "card_posted", {
                notification: notificationId,
            });
            return;
        }
        const nowMs = Date.now();
        const last = this.lastUpdateDiagnosticAt.get(notificationId) ?? 0;
        if (nowMs - last < CARD_UPDATE_DIAGNOSTIC_INTERVAL_MS) return;
        this.lastUpdateDiagnosticAt.set(notificationId, nowMs);
        void recordDiagnostic("live_update", "card_updated", {
            notification: notificationId,
        });
    }
}

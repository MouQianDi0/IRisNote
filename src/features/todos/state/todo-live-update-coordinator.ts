import {
    diagnosticErrorCategory,
    recordDiagnostic,
} from "@/core/diagnostics";
import type { NativeLiveTodoTimelineCard } from "@modules/irisnote-system";
import { toDateId } from "@/shared/utils/date-id";
import type { TodoEntity } from "../todos.types";
import {
    desiredTodoSummary,
    todoSummaryTimeline,
    type TodoSummaryCard,
} from "../services/todo-aggregate-live.service";
import {
    desiredTodoLiveDemoUpdate,
    desiredTodoLiveTimelines,
    desiredTodoLiveUpdates,
    type TodoLiveTimelineCard,
    type TodoLiveUpdateCard,
} from "../services/todo-live-update.service";

/** card_updated 诊断采样下限：同卡两次"原位更新"记录的最短间隔。 */
const CARD_UPDATE_DIAGNOSTIC_INTERVAL_MS = 5 * 60_000;

export type TodoLiveUpdatePort = {
    /** Android 16（API 36）进度式通知是否可用。 */
    supported(): boolean;
    /** ProgressStyle/提升式与前台服务秒级刷新能力（仅 Android 16+）。 */
    progressStyleSupported(): boolean;
    /** 系统通知权限是否已授予；读取失败按未授予处理。 */
    permissionGranted(): Promise<boolean>;
    summaryPermissionGranted(): Promise<boolean>;
    post(card: TodoLiveUpdateCard): Promise<void>;
    postSummary(card: TodoSummaryCard): Promise<void>;
    cancel(notificationId: number): Promise<void>;
    /** 方案 A：退后台移交时间线快照，原生闹钟节拍按墙钟差量刷新。 */
    handoff(timelines: readonly NativeLiveTodoTimelineCard[]): Promise<void>;
    /** 撤销原生接管（取消闹钟 + 清快照，不动已展示通知）；失败时拒绝。 */
    cancelTimeline(): Promise<void>;
    /** 方案 B 数据供给：仅持久化时间线快照（不排闹钟），供 FGS 每秒重算。 */
    persistTimeline(
        timelines: readonly NativeLiveTodoTimelineCard[],
    ): Promise<void>;
    /** 方案 B：按需启停前台服务（active=true 启动秒级刷新）。 */
    ensureForegroundService(active: boolean): Promise<void>;
};

export type TodoLiveUpdateSnapshot = {
    ownerKey: string | null;
    ready: boolean;
    entities: readonly TodoEntity[];
    /** 临时模拟待办，独立于真实实体和三张真实卡片的额度。 */
    demoTimeline?: TodoLiveTimelineCard | null;
};

function desiredTimelines(current: TodoLiveUpdateSnapshot, now: Date) {
    const real = current.ready && current.ownerKey
        ? desiredTodoLiveTimelines(current.entities, now)
        : [];
    const demo = current.demoTimeline;
    return demo && demo.endAt !== null && demo.endAt > now.getTime()
        ? [...real, demo]
        : real;
}

function toNativeTimeline(
    card: TodoLiveTimelineCard,
): NativeLiveTodoTimelineCard {
    return {
        id: card.notificationId,
        channelId: card.channelId,
        title: card.title,
        textStarted: card.textStarted,
        startAt: card.startAt,
        endAt: card.endAt,
        promoted: card.promoted,
    };
}

/**
 * 待办动态进度卡片协调器（前台）：
 * - refresh 按最新快照与权限做差量——新增发卡片、有变化原位更新、消失撤卡片；
 * - start 后每 30 秒例行刷新（进度分钟级变化）；start 先收回原生接管权，
 *   收回失败即放弃本轮接管（保持原生分钟级驱动，避免双驱动）；
 * - handoff 退后台移交时间线快照（方案 A 分钟级 + 方案 C 系统秒级计时），
 *   卡片保留由原生续算，不撤卡；移交在途被 start()/stop() 抢先时补撤销；
 *   移交失败时撤销原生接管并逐卡撤下（不留冻结错误进度）；
 * - stop 撤下全部卡片并撤销原生接管与前台服务（Provider 卸载时调用）。
 * 单轮 refresh 串行；并发请求合并复用同一轮。
 * 竞态防护：每次 stop/handoff 递增 epoch，进行中的 run() 在每个 await 恢复点
 * 发现代数过期即中止——保证"交接之后不再有本代卡片残留/重发"；refresh 另有
 * active 门（未运行时由仓库订阅触发的刷新直接跳过）。
 * 所有权不变式：任意时刻卡片至多由"JS 差量"或"原生（闹钟/FGS）"一方驱动——
 * nativeOwns 标记移交结果，start/stop/失败清场负责收回。
 */
export class TodoLiveUpdateCoordinator {
    private cards = new Map<number, TodoLiveUpdateCard>();
    private summaryCard: TodoSummaryCard | null = null;
    private summarySeenActivity = false;
    private summaryOwnerKey: string | null = null;
    private summaryDateId: string | null = null;
    private handedOffIds = new Set<number>();
    private demoTimeline: TodoLiveTimelineCard | null = null;
    private pending: Promise<void> | null = null;
    private interval: ReturnType<typeof setInterval> | null = null;
    private epoch = 0;
    private foregroundServiceEnabled = false;
    /** 前台服务当前是否处于运行态（跨 run 幂等启停与停止后强制重发依据）。 */
    private fgsRunning = false;
    /** 原生（闹钟/FGS 快照）当前是否拥有卡片驱动权。 */
    private nativeOwns = false;
    private lastUpdateDiagnosticAt = new Map<number, number>();
    constructor(
        private readonly port: TodoLiveUpdatePort,
        private readonly snapshot: () => TodoLiveUpdateSnapshot,
        private readonly now = () => new Date(),
    ) {}

    /** 诊断入口核实模拟卡片已经由系统通知端口接受。 */
    hasPosted(notificationId: number, chronoAt?: number): boolean {
        const card = this.cards.get(notificationId);
        return !!card && (chronoAt === undefined || card.chronoAt === chronoAt);
    }

    /** 注入临时模拟待办；调用方随后 refresh 或 handoff，不写真实仓库。 */
    setDemoTimeline(timeline: TodoLiveTimelineCard | null): void {
        this.demoTimeline = timeline;
    }

    private currentSnapshot(): TodoLiveUpdateSnapshot {
        const current = this.snapshot();
        const day = toDateId(this.now());
        if (current.ownerKey !== this.summaryOwnerKey || day !== this.summaryDateId) {
            this.summaryOwnerKey = current.ownerKey;
            this.summaryDateId = day;
            this.summarySeenActivity = false;
        }
        return { ...current, demoTimeline: this.demoTimeline ?? current.demoTimeline };
    }

    private async readPermissions(): Promise<{ details: boolean; summary: boolean }> {
        const [details, summary] = await Promise.allSettled([
            this.port.permissionGranted(), this.port.summaryPermissionGranted(),
        ]);
        for (const result of [details, summary]) {
            if (result.status === "rejected") void recordDiagnostic(
                "live_update", "permission_read_failed",
                { error: diagnosticErrorCategory(result.reason) }, "error",
            );
        }
        return {
            details: details.status === "fulfilled" && details.value,
            summary: summary.status === "fulfilled" && summary.value,
        };
    }

    private nativeTimelines(
        current: TodoLiveUpdateSnapshot,
        now: Date,
        detailsEnabled: boolean,
        summaryEnabled: boolean,
    ): NativeLiveTodoTimelineCard[] {
        const details = detailsEnabled ? desiredTimelines(current, now).map(toNativeTimeline) : [];
        if (!summaryEnabled || !current.ready || !current.ownerKey) return details;
        const summary = todoSummaryTimeline(current.entities, now, this.summarySeenActivity);
        const currentCard = desiredTodoSummary(summary, now);
        if (!currentCard && summary.items.length === 0) return details;
        const midnight = new Date(now);
        midnight.setHours(24, 0, 0, 0);
        return [...details, {
            id: summary.id, channelId: summary.channelId, title: "",
            textStarted: null, startAt: 0, endAt: midnight.getTime(), promoted: true,
            summaryItems: summary.items,
            summarySeenActivity: summary.seenActivity || currentCard !== null,
        }];
    }

    /** 方案 B 开关：true 且前台有活跃卡片时启动前台服务秒级刷新。 */
    setForegroundServiceEnabled(enabled: boolean): void {
        this.foregroundServiceEnabled = enabled;
        void this.applyForegroundService();
    }

    async start(): Promise<void> {
        if (!this.port.supported()) return;
        const epoch = this.epoch;
        // 回前台收回原生接管权（取消闹钟/清快照，不动通知），JS 差量对账。
        try {
            await this.port.cancelTimeline();
        } catch (cause) {
            // 收回失败：原生闹钟仍持旧快照驱动，本轮放弃 JS 接管避免双驱动
            // （降级为原生分钟级；下一次 start 重试收回）。
            void recordDiagnostic(
                "live_update",
                "reclaim_aborted_start",
                { error: diagnosticErrorCategory(cause) },
                "warning",
            );
            return;
        }
        // 等待期间 stop()/handoff() 已插入：放弃本次启动，由下一次 start 接管，
        // 避免"stop 之后协调器复活"竞态。
        if (epoch !== this.epoch) return;
        this.nativeOwns = false;
        if (this.interval) {
            await this.refresh();
            return;
        }
        this.interval = setInterval(() => void this.refresh(), 30_000);
        void recordDiagnostic("live_update", "coordinator_started");
        await this.refresh();
    }

    /**
     * 退后台：停 JS 驱动，把当日时间线（进行中 + 稍后开始）移交原生
     * 分钟级闹钟节拍；权限未授予或无资格卡时取消原生接管并撤下已发
     * 卡片（避免冻结的过期进度残留）。移交失败同样撤销原生接管并逐卡
     * 撤下——宁撤勿留冻结错误进度；移交在途被 start()/stop() 抢先
     *（代数变化或 JS 驱动已重建）时补撤销，保证不出现双驱动。
     */
    async handoff(): Promise<void> {
        if (!this.port.supported()) return;
        const epoch = this.epoch + 1;
        this.epoch = epoch;
        this.pending = null;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        const { details: granted, summary: summaryGranted } = await this.readPermissions();
        const current = this.currentSnapshot();
        const timelines = this.nativeTimelines(current, this.now(), granted, summaryGranted);
        const ids = [...new Set([...this.cards.keys(), ...(this.summaryCard ? [this.summaryCard.notificationId] : []), ...this.handedOffIds])];
        this.cards.clear();
        this.summaryCard = null;
        this.handedOffIds.clear();
        this.lastUpdateDiagnosticAt.clear();
        let handedOff = false;
        try {
            if (timelines.length > 0) {
                await this.port.handoff(timelines);
                handedOff = true;
                this.nativeOwns = true;
                this.handedOffIds = new Set(timelines.map((card) => card.id));
                const retained = new Set(timelines.map((card) => card.id));
                for (const id of ids) {
                    if (retained.has(id)) continue;
                    try { await this.port.cancel(id); } catch {
                        // 端口已记录失败；原生下个节拍仍会做渠道差量。
                    }
                }
            } else {
                await this.port.cancelTimeline();
            }
        } catch {
            // 交接失败已由端口实现记录诊断；撤销可能的半写原生状态后清场。
            try {
                await this.port.cancelTimeline();
            } catch {
                // 撤销失败已由端口实现记录诊断
            }
        }
        // 移交在途期间 start() 已重建 JS 驱动（start 不递增 epoch）或
        // stop() 已插入（代数变化）：撤销本次移交，避免双驱动 / stop 后原生复活。
        if (handedOff && (epoch !== this.epoch || this.interval !== null)) {
            this.nativeOwns = false;
            try {
                await this.port.cancelTimeline();
            } catch {
                // 撤销失败已由端口实现记录诊断
            }
            handedOff = false;
            this.handedOffIds.clear();
        }
        // 未成功移交（无资格或失败）：逐卡撤下（原生侧不接管，冻结/半写
        // 卡片必须由 JS 清场）。JS 驱动被抢先重建时立即让位——新代已重新
        // 认领并可能重发，此时撤卡会误杀新代。
        if (!handedOff) {
            for (const id of ids) {
                if (this.interval !== null) break;
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
        }
        if (epoch !== this.epoch) return;
        void recordDiagnostic("live_update", "handoff_completed", {
            cards: handedOff ? timelines.length : 0,
        });
    }

    async stop(): Promise<void> {
        if (!this.port.supported()) return;
        this.epoch += 1;
        this.pending = null;
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        this.nativeOwns = false;
        try {
            await this.port.cancelTimeline();
        } catch (cause) {
            // 停机时收回失败：继续撤卡清场（原生接管残留由下一次 start 收回）。
            void recordDiagnostic(
                "live_update",
                "reclaim_failed_during_stop",
                { error: diagnosticErrorCategory(cause) },
                "warning",
            );
        }
        try {
            await this.port.ensureForegroundService(false);
        } catch {
            // 端口实现已记录诊断
        }
        this.fgsRunning = false;
        if (this.cards.size === 0 && !this.summaryCard && this.handedOffIds.size === 0) return;
        const ids = [...new Set([...this.cards.keys(), ...(this.summaryCard ? [this.summaryCard.notificationId] : []), ...this.handedOffIds])];
        this.cards.clear();
        this.summaryCard = null;
        this.handedOffIds.clear();
        this.lastUpdateDiagnosticAt.clear();
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
        const { details: granted, summary: summaryGranted } = await this.readPermissions();
        if (epoch !== this.epoch) return;
        const current = this.currentSnapshot();
        const now = this.now();
        const summary = summaryGranted && current.ready && current.ownerKey
            ? desiredTodoSummary(
                todoSummaryTimeline(current.entities, now, this.summarySeenActivity), now,
                this.fgsRunning,
            ) : null;
        const real =
            granted && current.ready && current.ownerKey
                ? desiredTodoLiveUpdates(current.entities, now)
                : [];
        const demo = granted
            ? desiredTodoLiveDemoUpdate(current.demoTimeline, now)
            : null;
        const desired = demo ? [...real, demo] : real;
        const desiredMap = new Map(
            desired.map((card) => [card.notificationId, card]),
        );
        for (const id of this.handedOffIds) {
            if (!desiredMap.has(id) && summary?.notificationId !== id) {
                try { await this.port.cancel(id); } catch {
                    // 端口已记录失败；后续刷新可继续对账。
                }
            }
            this.handedOffIds.delete(id);
        }
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
                    // stop()/handoff() 已并发执行：本卡未被其撤除。若新一轮
                    // refresh 尚未重新认领（cards 无此 ID），补撤以免残留；
                    // 否则让新代管理。handoff 成功移交后原生拥有该卡
                    // （nativeOwns），补撤会误杀——跳过，原生下一节拍续算。
                    if (
                        !this.nativeOwns &&
                        !this.cards.has(card.notificationId)
                    ) {
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
        if (epoch !== this.epoch) return;
        if (this.summaryCard && !summary) {
            const id = this.summaryCard.notificationId;
            this.summaryCard = null;
            try {
                await this.port.cancel(id);
                void recordDiagnostic("live_update", "summary_removed", { notification: id });
            } catch (cause) {
                void recordDiagnostic("live_update", "summary_cancel_failed", {
                    notification: id, error: diagnosticErrorCategory(cause),
                }, "error");
            }
        }
        if (epoch !== this.epoch) return;
        if (summary && JSON.stringify(this.summaryCard) !== JSON.stringify(summary)) {
            try {
                await this.port.postSummary(summary);
                if (epoch !== this.epoch) {
                    if (!this.nativeOwns && !this.summaryCard)
                        await this.port.cancel(summary.notificationId);
                    return;
                }
                this.summaryCard = summary;
                this.summarySeenActivity = true;
                void recordDiagnostic("live_update", "summary_updated", {
                    notification: summary.notificationId,
                    scene: summary.scene,
                    count: summary.count,
                });
            } catch (cause) {
                void recordDiagnostic("live_update", "summary_post_failed", {
                    notification: summary.notificationId,
                    scene: summary.scene,
                    count: summary.count,
                    error: diagnosticErrorCategory(cause),
                }, "error");
            }
        }
        if (epoch === this.epoch) await this.applyForegroundService();
    }

    /**
     * 方案 B：前台运行中按开关与活跃卡数启停前台服务（幂等）。
     * 启动前先把时间线快照持久化到原生（不排闹钟）——FGS 每秒从快照
     * 重算，run() 每轮刷新使编辑/完成 1 秒内反映；持久化失败则跳过本次
     * 启动（FGS 无数据会立即安全停机，方案 A 分钟级继续兜底）。FGS 真实
     * 停止会移除其锚点卡通知：清空已发表，下一轮强制原位重发，避免
     * cardEquals 去重使该卡永久消失。
     */
    private async applyForegroundService(): Promise<void> {
        // 方案 B 前台服务秒级刷新仅 Android 16+（ProgressStyle 档）开放；
        // 低版本档位退后台只走方案 A 闹钟链分钟级。
        if (!this.port.progressStyleSupported()) return;
        if (!this.interval) return;
        const active = this.foregroundServiceEnabled &&
            (this.cards.size > 0 || this.summaryCard?.secondsEligible === true);
        const wasRunning = this.fgsRunning;
        // 从未运行也无需停止：跳过无谓的原生停用调用（30 秒节律下避免噪音）。
        if (!active && !wasRunning) return;
        try {
            if (active) {
                const current = this.currentSnapshot();
                const { details, summary } = await this.readPermissions();
                const timelines = this.nativeTimelines(current, this.now(), details, summary);
                if (timelines.length === 0) return;
                await this.port.persistTimeline(
                    timelines,
                );
                await this.port.ensureForegroundService(true);
                this.fgsRunning = true;
            } else {
                await this.port.ensureForegroundService(false);
                this.fgsRunning = false;
                if (wasRunning) {
                    this.cards.clear();
                    this.summaryCard = null;
                    this.lastUpdateDiagnosticAt.clear();
                    setTimeout(() => void this.refresh(), 0);
                }
            }
        } catch {
            // 端口实现已记录诊断；失败时方案 A 分钟级继续兜底。
        }
    }

    /** 卡片内容等价判定：任何用户可见字段（标题/正文/进度/总量/形态/计时锚点）变化都触发原位更新。 */
    private cardEquals(
        previous: TodoLiveUpdateCard,
        card: TodoLiveUpdateCard,
    ): boolean {
        return (
            previous.title === card.title &&
            previous.text === card.text &&
            previous.progress === card.progress &&
            previous.max === card.max &&
            previous.indeterminate === card.indeterminate &&
            previous.chronoAt === card.chronoAt &&
            previous.chronoCountdown === card.chronoCountdown
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

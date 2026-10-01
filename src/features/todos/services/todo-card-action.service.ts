import AsyncStorage from "@react-native-async-storage/async-storage";
import {
    opaqueDiagnosticId,
    recordDiagnostic,
} from "@/core/diagnostics";
import type { NativePendingCardAction } from "@modules/irisnote-system";
import { toDateId } from "@/shared/utils/date-id";
import { timeOnDate } from "../domain/todo-state";
import { assertValidTodo } from "../domain/todo-validation";
import { todoFields } from "./todo-service";
import { TodoError, type TodoEntity, type TodoFields } from "../todos.types";

/** 动态卡「+30分钟」的真实时间偏移（仅结束时间；与原生 LiveTodoActionReceiver.SNOOZE_MS 一致）。 */
export const TODO_CARD_SNOOZE_MINUTES = 30;

const SUPPRESSION_STORAGE_KEY = "irisnote.live-todo.card-suppressions.v1";

export type PendingCardAction = NativePendingCardAction;

/** 原生标记 JSON → 强类型列表；缺字段/动作未知的条目丢弃（不阻塞其余消费）。 */
export function parsePendingCardActions(payload: string): PendingCardAction[] {
    let array: unknown;
    try {
        array = JSON.parse(payload);
    } catch {
        return [];
    }
    if (!Array.isArray(array)) return [];
    const known = new Set(["cancel", "snooze", "complete"]);
    return array.filter(
        (item): item is PendingCardAction =>
            !!item &&
            typeof item === "object" &&
            typeof (item as PendingCardAction).id === "string" &&
            typeof (item as PendingCardAction).action === "string" &&
            known.has((item as PendingCardAction).action) &&
            ((item as PendingCardAction).clientId ?? "") !== "" &&
            ((item as PendingCardAction).ownerKey ?? "") !== "",
    );
}

const pad2 = (value: number): string => String(value).padStart(2, "0");
const formatTime = (date: Date): string =>
    `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

/**
 * 「+30分钟」的字段计算：仅把结束时间后移 30 分钟，开始时间与 dateId 不动。
 * 数据模型要求结束≥开始且同日，+30 分钟跨过午夜时抛校验错误（调用方按
 * 不可恢复错误丢弃标记）；无结束时间同样抛错（按钮本就不下发，标记兜底）。
 */
export function postponeTodoEndTime(
    todo: TodoEntity,
    deltaMinutes: number = TODO_CARD_SNOOZE_MINUTES,
): Pick<TodoFields, "endTime"> {
    if (todo.endTime === null)
        throw new TodoError("validation", "该待办没有结束时间，无法 +30 分钟");
    const end = new Date(timeOnDate(todo.dateId, todo.endTime) + deltaMinutes * 60_000);
    if (toDateId(end) !== todo.dateId)
        throw new TodoError("validation", "+30 分钟将跨过午夜，请在应用内调整");
    return { endTime: formatTime(end) };
}

/**
 * 「取消通知」抑制表：该待办本周期动态卡永久取消（AsyncStorage 持久）。
 * 仅按 clientId 存在性修剪——完成态仍保留抑制（再取消完成也不会复活卡片）。
 * 进程内缓存保证协调器 30 秒节拍的同步判定零等待。
 */
class LiveTodoCardSuppressions {
    private loaded = false;
    private loading: Promise<void> | null = null;
    private entries = new Map<string, { ownerKey: string; clientId: string }>();

    private key(ownerKey: string, clientId: string): string {
        return `${ownerKey}\u0000${clientId}`;
    }

    async ensureLoaded(): Promise<void> {
        if (this.loaded) return;
        if (!this.loading) {
            this.loading = (async () => {
                try {
                    const raw = await AsyncStorage.getItem(SUPPRESSION_STORAGE_KEY);
                    const parsed: unknown = raw ? JSON.parse(raw) : [];
                    if (Array.isArray(parsed)) {
                        for (const item of parsed) {
                            if (
                                item &&
                                typeof item === "object" &&
                                typeof (item as { ownerKey?: unknown }).ownerKey === "string" &&
                                typeof (item as { clientId?: unknown }).clientId === "string"
                            ) {
                                const { ownerKey, clientId } = item as {
                                    ownerKey: string;
                                    clientId: string;
                                };
                                this.entries.set(this.key(ownerKey, clientId), {
                                    ownerKey,
                                    clientId,
                                });
                            }
                        }
                    }
                } catch {
                    // 存储不可读按空表处理：最坏后果是卡片提前恢复，属表现层状态。
                } finally {
                    this.loaded = true;
                }
            })();
        }
        await this.loading;
    }

    isSuppressed(ownerKey: string, clientId: string): boolean {
        if (!this.loaded) return false;
        return this.entries.has(this.key(ownerKey, clientId));
    }

    async suppress(ownerKey: string, clientId: string): Promise<void> {
        await this.ensureLoaded();
        this.entries.set(this.key(ownerKey, clientId), { ownerKey, clientId });
        await this.persist();
    }

    /** 删除待办后修剪无效抑制项（完成/未完成不修剪，见上）。 */
    async prune(ownerKey: string, todos: readonly TodoEntity[]): Promise<void> {
        if (!this.loaded) await this.ensureLoaded();
        const alive = new Set(todos.map((todo) => todo.clientId));
        const stale = [...this.entries.values()].filter(
            (entry) => entry.ownerKey === ownerKey && !alive.has(entry.clientId),
        );
        if (stale.length === 0) return;
        for (const entry of stale)
            this.entries.delete(this.key(entry.ownerKey, entry.clientId));
        await this.persist();
    }

    private async persist(): Promise<void> {
        try {
            await AsyncStorage.setItem(
                SUPPRESSION_STORAGE_KEY,
                JSON.stringify([...this.entries.values()]),
            );
        } catch {
            // 持久化失败保留内存态：重启后卡片可能复活，属可接受的降级。
        }
    }
}

/** 模块级单例：协调器同步过滤与消费例程共用同一份抑制状态。 */
export const liveTodoCardSuppressions = new LiveTodoCardSuppressions();

export type TodoCardTarget =
    | { kind: "current"; todo: TodoEntity }
    | { kind: "owner-mismatch" }
    | { kind: "missing" };

export type TodoCardActionPort = {
    /** 原生模块（Expo Go 为 null，整条链路短路）。 */
    native: {
        consumePendingTodoActions(): Promise<string>;
        clearPendingTodoActions(payload: string): Promise<void>;
    } | null;
    /** 当前登录账号是否与标记一致；不一致保留标记等待账号切回。 */
    isCurrentOwner(ownerKey: string): boolean;
    findTodo(ownerKey: string, clientId: string): TodoCardTarget;
    updateTodo(
        ownerKey: string,
        base: TodoEntity,
        patch: Partial<TodoFields>,
        now: Date,
    ): Promise<unknown>;
    completeTodo(
        ownerKey: string,
        base: TodoEntity,
        now: Date,
    ): Promise<unknown>;
    dismissCard(ownerKey: string, clientId: string): Promise<void>;
};

const opaque = (ownerKey: string, clientId: string) =>
    opaqueDiagnosticId(`${ownerKey}:${clientId}`);

function isTodoError(cause: unknown, code: TodoError["code"]): boolean {
    return cause instanceof TodoError && cause.code === code;
}

/** 单条动作应用结果：applied/discarded 清标记，kept 保留（账号不匹配）。 */
type ApplyOutcome = "applied" | "discarded" | "kept";

async function applyCardAction(
    port: TodoCardActionPort,
    entry: PendingCardAction,
    now: Date,
): Promise<ApplyOutcome> {
    if (!port.isCurrentOwner(entry.ownerKey)) return "kept";
    if (entry.action === "cancel") {
        await port.dismissCard(entry.ownerKey, entry.clientId);
        void recordDiagnostic("live_update", "card_action_applied", {
            action: entry.action,
            todo: opaque(entry.ownerKey, entry.clientId),
        });
        return "applied";
    }
    const found = port.findTodo(entry.ownerKey, entry.clientId);
    if (found.kind === "owner-mismatch") return "kept";
    if (found.kind === "missing") {
        void recordDiagnostic("live_update", "card_action_discarded", {
            action: entry.action,
            todo: opaque(entry.ownerKey, entry.clientId),
            reason: "missing",
        });
        return "discarded";
    }
    const base = found.todo;
    if (entry.action === "complete") {
        if (base.isCompleted) return "discarded";
        const applied = await applyWithConflictRetry(port, entry, now, () =>
            port.completeTodo(entry.ownerKey, base, now),
        );
        return applied;
    }
    // snooze：真实后移结束时间（数据变更，随更新链路同步服务端）。
    if (base.isCompleted || base.endTime === null) {
        void recordDiagnostic("live_update", "card_action_discarded", {
            action: entry.action,
            todo: opaque(entry.ownerKey, entry.clientId),
            reason: base.isCompleted ? "completed" : "no-end-time",
        });
        return "discarded";
    }
    let patch: Pick<TodoFields, "endTime">;
    try {
        patch = postponeTodoEndTime(base);
        assertValidTodo({ ...todoFields(base), ...patch });
    } catch (cause) {
        // 时间无效（跨午夜/DST 边缘）属不可恢复，丢弃并记录，避免无限重试。
        void recordDiagnostic("live_update", "card_action_discarded", {
            action: entry.action,
            todo: opaque(entry.ownerKey, entry.clientId),
            reason: isTodoError(cause, "validation") ? "validation" : "postpone-invalid",
        });
        return "discarded";
    }
    return applyWithConflictRetry(port, entry, now, () =>
        port.updateTodo(entry.ownerKey, base, patch, now),
    );
}

/** 冲突重读一次再试；仍冲突按“意图已被并发编辑取代”丢弃。 */
async function applyWithConflictRetry(
    port: TodoCardActionPort,
    entry: PendingCardAction,
    now: Date,
    run: () => Promise<unknown>,
): Promise<ApplyOutcome> {
    try {
        await run();
    } catch (cause) {
        if (!isTodoError(cause, "conflict")) {
            // 非冲突失败保留标记，下次前台重试（弱网/数据库忙碌）。
            void recordDiagnostic("live_update", "card_action_failed", {
                action: entry.action,
                todo: opaque(entry.ownerKey, entry.clientId),
                error: cause instanceof Error ? cause.name : "unknown",
            }, "error");
            return "kept";
        }
        const found = port.findTodo(entry.ownerKey, entry.clientId);
        if (found.kind !== "current" || found.todo.isCompleted) {
            void recordDiagnostic("live_update", "card_action_discarded", {
                action: entry.action,
                todo: opaque(entry.ownerKey, entry.clientId),
                reason: "conflict-superseded",
            });
            return "discarded";
        }
        const retryBase = found.todo;
        try {
            await (entry.action === "complete"
                ? port.completeTodo(entry.ownerKey, retryBase, now)
                : port.updateTodo(
                    entry.ownerKey,
                    retryBase,
                    postponeTodoEndTime(retryBase),
                    now,
                ));
        } catch (retryCause) {
            void recordDiagnostic("live_update", "card_action_discarded", {
                action: entry.action,
                todo: opaque(entry.ownerKey, entry.clientId),
                reason: isTodoError(retryCause, "conflict")
                    ? "conflict-superseded"
                    : "retry-failed",
            });
            // 重试仍冲突/时间无效 = 意图已被并发状态取代或不可恢复，废弃；
            // 其余失败保留标记等待下次重试。
            return isTodoError(retryCause, "conflict") ||
                isTodoError(retryCause, "validation")
                ? "discarded"
                : "kept";
        }
    }
    void recordDiagnostic("live_update", "card_action_applied", {
        action: entry.action,
        todo: opaque(entry.ownerKey, entry.clientId),
    });
    return "applied";
}

/**
 * 消费动态卡操作标记（原生事件 / Provider refresh / 退后台移交前共用入口）。
 * 读取快照 → 逐条应用 → 成功（applied/discarded）才按 id 清除；
 * kept（账号不匹配）与失败条目留存标记等待重试，保证最终一致。
 */
export async function consumePendingCardActions(
    port: TodoCardActionPort,
    now = new Date(),
): Promise<void> {
    if (!port.native) return;
    let pending: PendingCardAction[];
    try {
        pending = parsePendingCardActions(await port.native.consumePendingTodoActions());
    } catch (cause) {
        void recordDiagnostic("live_update", "card_action_read_failed", {
            error: cause instanceof Error ? cause.name : "unknown",
        }, "warning");
        return;
    }
    if (pending.length === 0) return;
    void recordDiagnostic("live_update", "card_action_received", {
        count: pending.length,
    });
    const settled: string[] = [];
    for (const entry of pending) {
        try {
            const outcome = await applyCardAction(port, entry, now);
            if (outcome !== "kept") settled.push(entry.id);
        } catch (cause) {
            void recordDiagnostic("live_update", "card_action_failed", {
                action: entry.action,
                todo: opaque(entry.ownerKey, entry.clientId),
                error: cause instanceof Error ? cause.name : "unknown",
            }, "error");
        }
    }
    if (settled.length === 0) return;
    try {
        await port.native.clearPendingTodoActions(
            JSON.stringify(settled.map((id) => ({ id }))),
        );
    } catch (cause) {
        void recordDiagnostic("live_update", "card_action_clear_failed", {
            error: cause instanceof Error ? cause.name : "unknown",
        }, "warning");
    }
}

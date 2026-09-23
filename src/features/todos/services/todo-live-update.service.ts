import { LIVE_TODO_CHANNEL } from "@/core/system-notifications/system-notification.types";
import { toDateId } from "@/shared/utils/date-id";
import { timeOnDate, todoTitle } from "../domain/todo-state";
import type { TodoEntity } from "../todos.types";
import { reminderSummary } from "./todo-reminder.service";

/** 同屏动态进度卡片上限：超出部分确定性截断，不补发普通通知。 */
export const LIVE_TODO_MAX_CARDS = 3;

export type TodoLiveUpdateCard = {
    /** Android NotificationManager 整型通知 ID：同一待办跨刷新稳定，实现原位更新。 */
    notificationId: number;
    channelId: string;
    title: string;
    text: string;
    /** 已进行分钟数（indeterminate 时无意义）。 */
    progress: number;
    /** 总分钟数（indeterminate 时为 0）。 */
    max: number;
    indeterminate: boolean;
    ongoing: boolean;
    /** 系统 chronometer 秒级计时锚点（epoch ms）：倒计时终点或正计时起点；null 不启用。 */
    chronoAt: number | null;
    chronoCountdown: boolean;
};

/**
 * 退后台移交原生的待办时间线快照：原生凭墙钟即可重算进度与文案，
 * 无需 JS/数据库参与；可含今日稍后开始的待办（到点由原生节拍补发）。
 */
export type TodoLiveTimelineCard = {
    notificationId: number;
    channelId: string;
    title: string;
    /** 不定进度（无结束时间）卡片的固定文案；有结束时间时为 null。 */
    textStarted: string | null;
    /** 开始时刻（epoch ms）。 */
    startAt: number;
    /** 结束时刻（epoch ms）；null = 不定进度。 */
    endAt: number | null;
    promoted: boolean;
};

/**
 * FNV-1a 32 位哈希 → 正整型通知 ID。
 * 加 16 偏移避开小号保留段（如设置页演示 ID 7001）；跨账号/待办稳定、不可逆。
 */
export function liveUpdateNotificationId(
    ownerKey: string,
    todoId: string,
): number {
    let hash = 0x811c9dc5;
    for (const char of `live:${ownerKey}:${todoId}`) {
        hash ^= char.codePointAt(0) ?? 0;
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return (hash % 0x7ffffff0) + 16;
}

/**
 * 资格（时间线口径）：当天、reminderEnabled、未完成、有开始时刻、
 * 未过结束（含尚未开始与恰好结束瞬间）。前台进行中卡片与到点提醒均以此为
 * 公共前置；进行中口径额外要求"已到开始"。
 */
export function todoTimelineEligibleTodo(
    todo: TodoEntity,
    now: Date,
): boolean {
    if (!todo.reminderEnabled || todo.isCompleted) return false;
    if (todo.startTime === null) return false;
    if (todo.dateId !== toDateId(now)) return false;
    if (
        todo.endTime !== null &&
        timeOnDate(todo.dateId, todo.endTime) < now.getTime()
    )
        return false;
    return true;
}

/**
 * 资格（进行中口径）：时间线资格 + 已到开始（含恰好开始）。
 * 恰好结束仍算进行中，与列表状态口径一致。仅前台驱动，与到点提醒独立。
 */
export function liveUpdateEligibleTodo(todo: TodoEntity, now: Date): boolean {
    if (!todoTimelineEligibleTodo(todo, now)) return false;
    if (todo.startTime === null) return false;
    if (timeOnDate(todo.dateId, todo.startTime) > now.getTime()) return false;
    return true;
}

/** 生成单条待办的动态进度卡片描述；不满足资格返回 null。 */
export function desiredTodoLiveUpdate(
    todo: TodoEntity,
    now: Date,
): TodoLiveUpdateCard | null {
    const startTime = todo.startTime;
    if (startTime === null) return null;
    if (!liveUpdateEligibleTodo(todo, now)) return null;
    const notificationId = liveUpdateNotificationId(
        todo.ownerKey,
        todo.clientId,
    );
    const title = reminderSummary(todoTitle(todo));
    if (todo.endTime === null) {
        return {
            notificationId,
            channelId: LIVE_TODO_CHANNEL,
            title,
            text: `已开始 ${startTime}，进行中`,
            progress: 0,
            max: 0,
            indeterminate: true,
            ongoing: true,
            chronoAt: timeOnDate(todo.dateId, startTime),
            chronoCountdown: false,
        };
    }
    const start = timeOnDate(todo.dateId, startTime);
    const end = timeOnDate(todo.dateId, todo.endTime);
    const totalMinutes = Math.max(1, Math.round((end - start) / 60_000));
    const elapsedMinutes = Math.min(
        totalMinutes,
        Math.max(0, Math.round((now.getTime() - start) / 60_000)),
    );
    return {
        notificationId,
        channelId: LIVE_TODO_CHANNEL,
        title,
        text: `已进行 ${elapsedMinutes} / ${totalMinutes} 分钟`,
        progress: elapsedMinutes,
        max: totalMinutes,
        indeterminate: false,
        ongoing: true,
        chronoAt: end,
        chronoCountdown: true,
    };
}

/** 汇总当日进行中待办的动态卡片；按通知 ID 排序后截断到上限，保证确定性。 */
export function desiredTodoLiveUpdates(
    todos: readonly TodoEntity[],
    now: Date,
    limit = LIVE_TODO_MAX_CARDS,
): TodoLiveUpdateCard[] {
    return todos
        .map((todo) => desiredTodoLiveUpdate(todo, now))
        .filter((card): card is TodoLiveUpdateCard => card !== null)
        .sort((a, b) => a.notificationId - b.notificationId)
        .slice(0, Math.max(0, limit));
}

/** 生成单条待办的时间线快照；不满足时间线资格返回 null。 */
export function desiredTodoLiveTimeline(
    todo: TodoEntity,
    now: Date,
): TodoLiveTimelineCard | null {
    const startTime = todo.startTime;
    if (startTime === null) return null;
    if (!todoTimelineEligibleTodo(todo, now)) return null;
    return {
        notificationId: liveUpdateNotificationId(todo.ownerKey, todo.clientId),
        channelId: LIVE_TODO_CHANNEL,
        title: reminderSummary(todoTitle(todo)),
        textStarted:
            todo.endTime === null ? `已开始 ${startTime}，进行中` : null,
        startAt: timeOnDate(todo.dateId, startTime),
        endAt:
            todo.endTime !== null
                ? timeOnDate(todo.dateId, todo.endTime)
                : null,
        promoted: true,
    };
}

/**
 * 汇总当日待办的时间线快照（进行中 + 今日稍后开始）；进行中优先、
 * 组内按通知 ID 排序后截断到上限——退后台不因未来卡挤掉进行中卡
 * （与前台"仅进行中参与截断"的优先级一致），且保证确定性。
 */
export function desiredTodoLiveTimelines(
    todos: readonly TodoEntity[],
    now: Date,
    limit = LIVE_TODO_MAX_CARDS,
): TodoLiveTimelineCard[] {
    const nowMs = now.getTime();
    return todos
        .map((todo) => desiredTodoLiveTimeline(todo, now))
        .filter((card): card is TodoLiveTimelineCard => card !== null)
        .sort((a, b) => {
            // 资格已排除过结束时刻的卡：startAt 未到即未来卡。
            const aFuture = Number(a.startAt > nowMs);
            const bFuture = Number(b.startAt > nowMs);
            return aFuture - bFuture || a.notificationId - b.notificationId;
        })
        .slice(0, Math.max(0, limit));
}

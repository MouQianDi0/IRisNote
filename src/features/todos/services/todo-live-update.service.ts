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
 * 资格：当天、reminderEnabled、未完成、有开始时刻、已到开始（含恰好开始）、
 * 未过结束（恰好结束仍算进行中，与列表状态口径一致）。仅前台驱动，与到点提醒独立。
 */
export function liveUpdateEligibleTodo(todo: TodoEntity, now: Date): boolean {
    if (!todo.reminderEnabled || todo.isCompleted) return false;
    if (todo.startTime === null) return false;
    if (todo.dateId !== toDateId(now)) return false;
    const instant = now.getTime();
    if (timeOnDate(todo.dateId, todo.startTime) > instant) return false;
    if (
        todo.endTime !== null &&
        timeOnDate(todo.dateId, todo.endTime) < instant
    )
        return false;
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

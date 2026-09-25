import {
    LIVE_TODO_SUMMARY_CHANNEL,
    LIVE_TODO_SUMMARY_NOTIFICATION_ID,
} from "@/core/system-notifications/system-notification.types";
import { toDateId } from "@/shared/utils/date-id";
import { timeOnDate, todoTitle } from "../domain/todo-state";
import type { TodoEntity } from "../todos.types";
import { reminderSummary } from "./todo-reminder.service";

export const TODO_SUMMARY_NEAR_MS = 60 * 60_000;
export const TODO_SUMMARY_END_HOLD_MS = 10 * 60_000;

export type TodoSummaryScene = "today" | "near" | "active" | "ended";
export type TodoSummaryItem = {
    title: string;
    startAt: number | null;
    endAt: number | null;
    completed: boolean;
    starred: boolean;
    completedAt: number | null;
};
export type TodoSummaryTimeline = {
    id: number;
    channelId: string;
    items: TodoSummaryItem[];
    /** 只在曾展示过活动卡后允许结束场景，防止冷启动补发空结束卡。 */
    seenActivity: boolean;
};
export type TodoSummaryCard = {
    notificationId: number;
    channelId: string;
    scene: TodoSummaryScene;
    count: number;
    starredCount: number;
    title: string;
    text: string;
    iconResourceName: string;
    chronoAt: number | null;
    chronoCountdown: boolean;
    /** 前台服务在最后一小时可每秒刷新；退后台由原生降为分钟文案。 */
    secondsEligible: boolean;
};

/** 仅取今天实体，不借用逐条卡的提醒开关和开始时间资格。 */
export function todoSummaryTimeline(
    todos: readonly TodoEntity[],
    now: Date,
    seenActivity: boolean,
): TodoSummaryTimeline {
    const today = toDateId(now);
    return {
        id: LIVE_TODO_SUMMARY_NOTIFICATION_ID,
        channelId: LIVE_TODO_SUMMARY_CHANNEL,
        seenActivity,
        items: todos.filter((todo) => todo.dateId === today).map((todo) => ({
            title: reminderSummary(todoTitle(todo)),
            startAt: todo.startTime === null ? null : timeOnDate(today, todo.startTime),
            endAt: todo.endTime === null ? null : timeOnDate(today, todo.endTime),
            completed: todo.isCompleted,
            starred: todo.isStarred,
            completedAt: todo.completedAt ? Date.parse(todo.completedAt) || null : null,
        })),
    };
}

/** 相同时间按脱敏标题排序，保证输入顺序改变时聚合文案不跳动。 */
export function desiredTodoSummary(
    timeline: TodoSummaryTimeline,
    now: Date,
    smoothSeconds = false,
): TodoSummaryCard | null {
    const nowMs = now.getTime();
    const pending = timeline.items.filter((item) => !item.completed);
    const count = pending.length;
    const starredCount = pending.filter((item) => item.starred).length;
    const timed = pending.filter((item) => item.startAt !== null &&
        (item.endAt === null || item.endAt > nowMs));
    const byStart = (a: TodoSummaryItem, b: TodoSummaryItem) =>
        (a.startAt ?? 0) - (b.startAt ?? 0) || a.title.localeCompare(b.title);
    const active = timed.filter((item) => (item.startAt ?? Infinity) <= nowMs)
        .sort(byStart)[0];
    const near = timed.filter((item) => (item.startAt ?? 0) > nowMs &&
        (item.startAt ?? Infinity) - nowMs <= TODO_SUMMARY_NEAR_MS)
        .sort(byStart)[0];
    const base = {
        notificationId: timeline.id,
        channelId: timeline.channelId,
        count,
        starredCount,
        chronoCountdown: false,
        secondsEligible: false,
    };
    if (active) {
        const remaining = active.endAt === null ? null : Math.max(0, active.endAt - nowMs);
        const duration = remaining === null ? "" : remaining <= TODO_SUMMARY_NEAR_MS && smoothSeconds
            ? `${String(Math.floor(remaining / 60_000)).padStart(2, "0")}:${String(Math.floor(remaining % 60_000 / 1000)).padStart(2, "0")}`
            : `${String(Math.floor(Math.ceil(remaining / 60_000) / 60)).padStart(2, "0")}:${String(Math.ceil(remaining / 60_000) % 60).padStart(2, "0")}`;
        return {
            ...base, scene: "active", title: `待办 ${count}·进行中 ${timed.filter((item) => (item.startAt ?? Infinity) <= nowMs).length}`,
            text: active.title + (duration ? ` · 剩余 ${duration}` : ""),
            iconResourceName: "ic_live_todo_active", chronoAt: active.endAt,
            chronoCountdown: active.endAt !== null,
            secondsEligible: remaining !== null && remaining <= TODO_SUMMARY_NEAR_MS,
        };
    }
    if (near) return {
        ...base, scene: "near", title: `待办 ${count}·临近 ${timed.filter((item) =>
            (item.startAt ?? 0) > nowMs && (item.startAt ?? Infinity) - nowMs <= TODO_SUMMARY_NEAR_MS).length}`,
        text: near.title, iconResourceName: "ic_live_todo_near", chronoAt: null,
    };
    const futureOrUntimed = pending.some((item) => item.startAt === null ||
        (item.startAt > nowMs && (item.endAt === null || item.endAt > nowMs)));
    if (futureOrUntimed) return {
        ...base, scene: "today", title: `待办 ${count}·重要 ${starredCount}`,
        text: `今日有 ${count} 条待办，${starredCount} 条重要`,
        iconResourceName: "ic_live_todo_today", chronoAt: null,
    };
    if (!timeline.seenActivity || timeline.items.length === 0) return null;
    const terminalAt = Math.max(...timeline.items.map((item) =>
        item.completed && item.completedAt !== null ? item.completedAt : item.endAt ?? -Infinity));
    if (!Number.isFinite(terminalAt) || nowMs < terminalAt || nowMs >= terminalAt + TODO_SUMMARY_END_HOLD_MS) return null;
    const completed = timeline.items.filter((item) => item.completed).length;
    return {
        ...base, scene: "ended", title: "待办结束",
        text: `${completed}·已完成`, iconResourceName: "ic_live_todo_ended",
        chronoAt: null,
    };
}

import { addDays, toDateId } from "@/shared/utils/date-id";
import type { TodoRepository } from "../data/todo-repository.port";
import { emptyTodoFields } from "../services/todo-service";

/** Called only for an explicit development preview owner, never a normal empty list. */
export async function seedTodoPreview(
    repository: TodoRepository,
    ownerKey: string,
    now: Date,
) {
    if (!ownerKey.startsWith("preview:") || repository.list(ownerKey).length)
        return;
    const today = toDateId(now);
    const samples = [
        {
            body: "整理今天的阅读笔记",
            priority: "normal" as const,
            startTime: "09:01",
            endTime: "09:37",
            isStarred: true,
        },
        {
            body: "完成本周的重要事项",
            priority: "high" as const,
            startTime: "14:00",
            endTime: "15:30",
            isPinned: true,
        },
        { body: "散步，给自己留一点时间", priority: "low" as const },
        { body: "已经完成的今日待办", completed: true },
        { body: "今天稍后处理", startTime: "23:59" },
        {
            body: "回看昨日已经完成的事项",
            dateId: addDays(today, -1),
            completed: true,
        },
        {
            body: "昨日尚未完成的事项",
            dateId: addDays(today, -1),
            priority: "high" as const,
        },
        { body: "明天的新计划", dateId: addDays(today, 1), startTime: "10:00" },
    ];
    const generation = repository.generation;
    for (const [index, { completed, ...sample }] of samples.entries()) {
        if (
            repository.ownerKey !== ownerKey ||
            repository.generation !== generation
        )
            return;
        const entity = await repository.create(
            ownerKey,
            `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
            { ...emptyTodoFields(today), ...sample },
            new Date(now.getTime() + index),
        );
        if (
            repository.ownerKey !== ownerKey ||
            repository.generation !== generation
        )
            return;
        if (completed) await repository.complete(ownerKey, entity, true, now);
    }
}

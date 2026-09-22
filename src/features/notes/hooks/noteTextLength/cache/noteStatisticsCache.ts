import type { NoteTextStatistics } from "../types";

export const NOTE_STATISTICS_CACHE_MAX_ENTRIES = 100;

type NoteStatisticsCacheEntry = {
    contentSnapshot: string;
    resultsByOptions: Map<string, NoteTextStatistics>;
};

type GetOrCreateCachedStatisticsParams = {
    noteId: number;
    contentSnapshot: string;
    optionsKey: string;
    calculate: () => NoteTextStatistics;
};

const noteStatisticsCache = new Map<number, NoteStatisticsCacheEntry>();

/**
 * Map 以插入顺序保存键；删除后重新写入即可把命中项移动到最近访问端。
 */
const touchCacheEntry = (
    noteId: number,
    cacheEntry: NoteStatisticsCacheEntry,
) => {
    noteStatisticsCache.delete(noteId);
    noteStatisticsCache.set(noteId, cacheEntry);
};

const evictLeastRecentlyUsedEntries = () => {
    while (noteStatisticsCache.size > NOTE_STATISTICS_CACHE_MAX_ENTRIES) {
        const oldestNoteId = noteStatisticsCache.keys().next().value;
        if (oldestNoteId === undefined) return;
        noteStatisticsCache.delete(oldestNoteId);
    }
};

/**
 * 一级缓存按笔记计数，二级缓存保存同一内容在不同统计选项下的结果。
 */
export const getOrCreateCachedNoteStatistics = ({
    noteId,
    contentSnapshot,
    optionsKey,
    calculate,
}: GetOrCreateCachedStatisticsParams) => {
    let cacheEntry = noteStatisticsCache.get(noteId);

    if (cacheEntry?.contentSnapshot !== contentSnapshot) {
        cacheEntry = {
            contentSnapshot,
            resultsByOptions: new Map(),
        };
    }

    touchCacheEntry(noteId, cacheEntry);
    evictLeastRecentlyUsedEntries();

    const cachedStatistics = cacheEntry.resultsByOptions.get(optionsKey);
    if (cachedStatistics) return cachedStatistics;

    const statistics = calculate();
    cacheEntry.resultsByOptions.set(optionsKey, statistics);
    return statistics;
};

/** 允许业务生命周期按笔记释放缓存，也支持在测试或退出流程中整体清空。 */
export const clearNoteStatisticsCache = (noteId?: number) => {
    if (noteId === undefined) {
        noteStatisticsCache.clear();
        return;
    }

    noteStatisticsCache.delete(noteId);
};

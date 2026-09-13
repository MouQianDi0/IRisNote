import type { Note } from "@/features/notes/notes.types";
import type { ReadingRecord } from "@/features/notes/reading/reading-position";

export type ContinueReadingItem = {
    noteId: number;
    title: string;
    percent: number;
    updatedAt: number;
};

export type ProfileOverview = {
    noteCount: number | null;
    categoryCount: number | null;
    starredCount: number | null;
    continueReading: ContinueReadingItem | null;
};

/**
 * 本地笔记包含尚未上传的变更，应优先于同一篇服务端笔记；服务端独有项
 * 只补足尚未写入本地数据库的内容，避免概览重复计数。
 */
export function mergeOverviewNotes(localNotes: Note[], serverNotes: Note[]) {
    const mergedByServerId = new Map<number, Note>();
    const localOnly: Note[] = [];

    serverNotes.forEach((note) => {
        const serverId = note.server_id ?? (note.id > 0 ? note.id : null);
        if (serverId != null) mergedByServerId.set(serverId, note);
    });

    localNotes.forEach((note) => {
        const serverId = note.server_id ?? (note.id > 0 ? note.id : null);
        if (serverId == null) {
            localOnly.push(note);
            return;
        }
        mergedByServerId.set(serverId, note);
    });

    return [...localOnly, ...mergedByServerId.values()];
}

/** 只返回仍可继续阅读、且对应笔记仍存在的最新结构化阅读记录。 */
export function selectContinueReading(
    notes: Note[],
    records: ReadingRecord[],
): ContinueReadingItem | null {
    const notesById = new Map(notes.map((note) => [note.id, note]));
    const latest = records
        .filter(
            (record) =>
                record.percent > 0 &&
                record.percent < 100 &&
                notesById.has(record.noteId),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];

    if (!latest) return null;
    const note = notesById.get(latest.noteId);
    if (!note) return null;

    return {
        noteId: note.id,
        title: note.title.trim() || "无标题笔记",
        percent: Math.round(latest.percent),
        updatedAt: latest.updatedAt,
    };
}

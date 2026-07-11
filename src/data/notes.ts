/**
 * 笔记数据缓存和状态管理模块
 *
 * 功能：
 * 1. 本地缓存笔记数据，减少 API 请求
 * 2. 使用观察者模式通知组件数据变化
 * 3. 支持按分类精细控制刷新范围
 */

// ==================== 类型定义 ====================

import type { Note } from "@/features/notes/notes.types";

/** 监听笔记变化的回调函数类型 */
type NotesListener = () => void;

/** 监听某分类下笔记被删除的回调函数类型 */
type NotesRemovedByCategoryListener = (categoryId: number) => void;

// ==================== 内部状态 ====================

/** 笔记变化监听器列表 */
const notesListeners: NotesListener[] = [];

/** 分类删除监听器列表 */
const notesRemovedByCategoryListeners: NotesRemovedByCategoryListener[] = [];

/** 笔记缓存表，key 为笔记 ID，value 为笔记对象 */
const cachedNotesById = new Map<number, Note>();

// ==================== 缓存操作 ====================

/**
 * 批量设置缓存笔记（全量替换）
 * @param notes - 要缓存的笔记数组
 */
export const setCachedNotes = (notes: Note[]) => {
    cachedNotesById.clear(); // 清空旧缓存
    notes.forEach((note) => {
        cachedNotesById.set(note.id, note);
    });
};

/**
 * 根据 ID 获取缓存的笔记
 * @param noteId - 笔记 ID
 * @returns 缓存的笔记，不存在则返回 null
 */
export const getCachedNoteById = (noteId: number) => {
    return cachedNotesById.get(noteId) ?? null;
};

/**
 * 根据 ID 删除缓存的笔记
 * @param noteId - 要删除的笔记 ID
 */
export const removeCachedNoteById = (noteId: number) => {
    cachedNotesById.delete(noteId);
};

// ==================== 观察者模式 ====================

/**
 * 通知所有监听器：笔记数据发生了变化
 * 用于新建、编辑、删除笔记后触发 UI 刷新
 */
export const notifyNotesChanged = () => {
    notesListeners.forEach((fn) => fn());
};

/**
 * 注册监听笔记变化的回调
 * @param fn - 变化时执行的回调函数
 * @returns 取消监听的函数
 *
 * @example
 * ```ts
 * const unsubscribe = onNotesChanged(() => {
 *     console.log('笔记变化了');
 * });
 * // 取消监听
 * unsubscribe();
 * ```
 */
export const onNotesChanged = (fn: NotesListener) => {
    notesListeners.push(fn);
    // 返回取消监听的函数
    return () => {
        const index = notesListeners.indexOf(fn);
        if (index >= 0) notesListeners.splice(index, 1);
    };
};

/**
 * 通知：某分类下的笔记被删除了
 * 只移除本地缓存中对应分类的笔记，避免全量刷新
 * @param categoryId - 被删除的分类 ID
 */
export const notifyNotesRemovedByCategory = (categoryId: number) => {
    notesRemovedByCategoryListeners.forEach((fn) => fn(categoryId));
};

/**
 * 注册监听某分类笔记删除的回调
 * @param fn - 分类删除时执行的回调函数
 * @returns 取消监听的函数
 */
export const onNotesRemovedByCategory = (
    fn: NotesRemovedByCategoryListener,
) => {
    notesRemovedByCategoryListeners.push(fn);
    return () => {
        const index = notesRemovedByCategoryListeners.indexOf(fn);
        if (index >= 0) notesRemovedByCategoryListeners.splice(index, 1);
    };
};

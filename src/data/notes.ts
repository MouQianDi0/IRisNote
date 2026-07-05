type NotesListener = () => void; // 监听笔记变化的回调函数
type NotesRemovedByCategoryListener = (categoryId: number) => void;

// 笔记变化监听器列表
const notesListeners: NotesListener[] = [];
const notesRemovedByCategoryListeners: NotesRemovedByCategoryListener[] = [];

export const notifyNotesChanged = () => {
    notesListeners.forEach((fn) => fn());
};

export const onNotesChanged = (fn: NotesListener) => {
    notesListeners.push(fn);
    return () => {
        const index = notesListeners.indexOf(fn);
        if (index >= 0) notesListeners.splice(index, 1);
    };
};

// 分类删除成功后，只移除本地缓存中对应分类的笔记，避免全量刷新全部笔记。
export const notifyNotesRemovedByCategory = (categoryId: number) => {
    notesRemovedByCategoryListeners.forEach((fn) => fn(categoryId));
};

export const onNotesRemovedByCategory = (
    fn: NotesRemovedByCategoryListener,
) => {
    notesRemovedByCategoryListeners.push(fn);
    return () => {
        const index = notesRemovedByCategoryListeners.indexOf(fn);
        if (index >= 0) notesRemovedByCategoryListeners.splice(index, 1);
    };
};

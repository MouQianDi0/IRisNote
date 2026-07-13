type NotesListener = () => void;
type NotesRemovedByCategoryListener = (categoryId: number) => void;

const notesListeners: NotesListener[] = [];
const notesRemovedByCategoryListeners: NotesRemovedByCategoryListener[] = [];

export const notifyNotesChanged = () => {
    notesListeners.forEach((listener) => listener());
};

export const onNotesChanged = (listener: NotesListener) => {
    notesListeners.push(listener);
    return () => {
        const index = notesListeners.indexOf(listener);
        if (index >= 0) notesListeners.splice(index, 1);
    };
};

export const notifyNotesRemovedByCategory = (categoryId: number) => {
    notesRemovedByCategoryListeners.forEach((listener) => listener(categoryId));
};

export const onNotesRemovedByCategory = (
    listener: NotesRemovedByCategoryListener,
) => {
    notesRemovedByCategoryListeners.push(listener);
    return () => {
        const index = notesRemovedByCategoryListeners.indexOf(listener);
        if (index >= 0) notesRemovedByCategoryListeners.splice(index, 1);
    };
};

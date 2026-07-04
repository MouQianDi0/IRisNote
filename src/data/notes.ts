type NotesListener = () => void;

const notesListeners: NotesListener[] = [];

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

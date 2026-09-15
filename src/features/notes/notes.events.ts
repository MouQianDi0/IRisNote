import type { Note } from "./notes.types";

export type NotesChangedEvent = {
    type: "upsert" | "remove";
    note?: Note;
    noteId?: number;
};

type NotesListener = (event: NotesChangedEvent) => void;
type NotesRemovedByCategoryListener = (categoryId: number) => void;

const notesListeners: NotesListener[] = [];
const notesRemovedByCategoryListeners: NotesRemovedByCategoryListener[] = [];

export const notifyNotesChanged = (event: NotesChangedEvent) => {
    notesListeners.forEach((listener) => listener(event));
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

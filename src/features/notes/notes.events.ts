import type { Note } from "./notes.types";

export type NotesChangedEvent = {
    type: "upsert" | "remove";
    note?: Note;
    noteId?: number;
    ownerUserId?: number;
};

let cloudWriteVersion = 0;
let cloudWrites = 0;
const cloudWriteListeners = new Set<() => void>();
export function noteCloudWriteStamp() {
    return { version: cloudWriteVersion, busy: cloudWrites > 0 };
}
/** Also covers the local receipt commit, not only the HTTP response. */
export function beginNoteCloudWrite() {
    cloudWriteVersion++;
    cloudWrites++;
    let finished = false;
    return () => {
        if (finished) return;
        finished = true;
        cloudWrites--;
        cloudWriteVersion++;
        cloudWriteListeners.forEach((listener) => {
            try {
                listener();
            } catch {
                console.warn("[Note sync] 写入后同步调度失败");
            }
        });
    };
}
export function onNoteCloudWrite(listener: () => void) {
    cloudWriteListeners.add(listener);
    return () => {
        cloudWriteListeners.delete(listener);
    };
}

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

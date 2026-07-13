import type { Note } from "./notes.types";

const cachedNotesById = new Map<number, Note>();

export const setCachedNotes = (notes: Note[]) => {
    cachedNotesById.clear();
    notes.forEach((note) => cachedNotesById.set(note.id, note));
};

export const getCachedNoteById = (noteId: number) =>
    cachedNotesById.get(noteId) ?? null;

export const removeCachedNoteById = (noteId: number) => {
    cachedNotesById.delete(noteId);
};

/** Write or replace one cached note without invalidating the remaining cache. */
export const setCachedNote = (note: Note) => {
    cachedNotesById.set(note.id, note);
};

import type { Note } from "./notes.types";

const cachedNotesByOwnerAndId = new Map<string, Note>();

const getCacheKey = (noteId: number, ownerUserId?: number) =>
    `${ownerUserId ?? "unknown"}:${noteId}`;

export const setCachedNotes = (notes: Note[]) => {
    cachedNotesByOwnerAndId.clear();
    notes.forEach((note) =>
        cachedNotesByOwnerAndId.set(getCacheKey(note.id, note.user_id), note),
    );
};

export const getCachedNoteById = (noteId: number, ownerUserId?: number) => {
    if (ownerUserId != null) {
        return (
            cachedNotesByOwnerAndId.get(getCacheKey(noteId, ownerUserId)) ??
            null
        );
    }

    return (
        [...cachedNotesByOwnerAndId.values()].find(
            (note) => note.id === noteId,
        ) ?? null
    );
};

export const removeCachedNoteById = (noteId: number, ownerUserId?: number) => {
    if (ownerUserId != null) {
        cachedNotesByOwnerAndId.delete(getCacheKey(noteId, ownerUserId));
        return;
    }

    for (const [key, note] of cachedNotesByOwnerAndId) {
        if (note.id === noteId) cachedNotesByOwnerAndId.delete(key);
    }
};

/** Write or replace one cached note without invalidating the remaining cache. */
export const setCachedNote = (note: Note) => {
    cachedNotesByOwnerAndId.set(getCacheKey(note.id, note.user_id), note);
};

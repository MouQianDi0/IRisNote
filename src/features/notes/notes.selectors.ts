import type { Note } from "./notes.types";

export const withLocalOrder = (notes: Note[]) =>
    notes.map((note, index) => ({
        ...note,
        is_pinned: Boolean(note.is_pinned),
        is_starred: Boolean(note.is_starred),
        local_order: note.local_order ?? index,
    }));

export const sortNotesByPinned = (notes: Note[]) =>
    [...notes].sort((a, b) => {
        const aPinned = Boolean(a.is_pinned);
        const bPinned = Boolean(b.is_pinned);

        if (aPinned !== bPinned) return Number(bPinned) - Number(aPinned);
        if (aPinned && bPinned) {
            return (b.pinned_order ?? 0) - (a.pinned_order ?? 0);
        }
        return (a.local_order ?? 0) - (b.local_order ?? 0);
    });

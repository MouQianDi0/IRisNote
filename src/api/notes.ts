import api from "@/api/client";
import type {
    CreateNotePayload,
    Note,
    UpdateNotePayload,
} from "@/features/notes/notes.types";

export type {
    CreateNotePayload,
    Note,
    UpdateNotePayload,
} from "@/features/notes/notes.types";

const normalizeNote = (note: Note): Note => ({
    ...note,
    content: note.content ?? null,
    category_id: note.category_id ?? null,
});

export async function getNotes(): Promise<Note[]> {
    const { data } = await api.get<Note[]>("/notes");
    return Array.isArray(data) ? data.map(normalizeNote) : [];
}

export async function createNote(payload: CreateNotePayload): Promise<Note> {
    const { data } = await api.post<Note>("/notes", payload);
    return normalizeNote(data);
}

export async function updateNote(
    noteId: number,
    payload: UpdateNotePayload,
): Promise<Note> {
    const { data } = await api.put<Note>(`/notes/${noteId}`, payload);
    return normalizeNote(data);
}

export async function deleteNote(noteId: number): Promise<{ success: boolean }> {
    const { data } = await api.delete<{ success: boolean }>(`/notes/${noteId}`);
    return data;
}

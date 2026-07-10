import api from "@/api/client";

export type Note = {
    id: number;
    user_id?: number;
    title: string;
    content: string | null;
    category_id: number | null;
    created_at: string;
    is_pinned?: boolean;
    is_starred?: boolean;
    local_order?: number;
    pinned_order?: number;
};

export type CreateNotePayload = {
    title: string;
    content: string;
    category_id?: number;
};

export type UpdateNotePayload = Partial<
    Pick<Note, "title" | "content" | "category_id" | "is_pinned" | "is_starred">
>;

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

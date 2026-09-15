import api from "@/shared/http/client";
import type {
    CreateNotePayload,
    Note,
    ServerNote,
    UpdateNotePayload,
} from "@/features/notes/notes.types";
import type { AxiosProgressEvent } from "axios";

export type {
    CreateNotePayload,
    Note,
    UpdateNotePayload,
} from "@/features/notes/notes.types";

export type NoteUploadOptions = {
    onUploadProgress?: (event: AxiosProgressEvent) => void;
    onResponse?: (status: number) => void;
};

const normalizeNote = (note: ServerNote): Note => ({
    ...note,
    server_id: note.id,
    content: note.content ?? null,
    category_id: note.category_id ?? null,
    current_revision_id: null,
    sync_status: "synced",
    sync_operation: null,
    last_sync_error: null,
});

function assertServerNote(note: unknown, expectedId?: number) {
    if (
        !note ||
        typeof note !== "object" ||
        !Number.isInteger((note as ServerNote).id) ||
        (note as ServerNote).id <= 0 ||
        typeof (note as ServerNote).title !== "string" ||
        typeof (note as ServerNote).created_at !== "string"
    ) {
        throw new Error("[Notes API] Server returned an invalid note response.");
    }

    if (expectedId != null && (note as ServerNote).id !== expectedId) {
        throw new Error("[Notes API] Updated note id does not match request id.");
    }

    return note as ServerNote;
}

export async function getNotes(): Promise<Note[]> {
    const { data } = await api.get<ServerNote[]>("/notes");
    if (!Array.isArray(data)) {
        throw new Error("[Notes API] Server returned an invalid notes list.");
    }
    return data.map((note) => normalizeNote(assertServerNote(note)));
}

export async function createNote(
    payload: CreateNotePayload,
    options: NoteUploadOptions = {},
): Promise<Note> {
    const response = await api.post<ServerNote>("/notes", payload, {
        onUploadProgress: options.onUploadProgress,
    });
    options.onResponse?.(response.status);
    return normalizeNote(assertServerNote(response.data));
}

export async function updateNote(
    noteId: number,
    payload: UpdateNotePayload,
    options: NoteUploadOptions = {},
): Promise<Note> {
    if (!Number.isInteger(noteId) || noteId <= 0) {
        throw new Error("[Notes API] A positive server note id is required.");
    }

    const response = await api.put<ServerNote>(`/notes/${noteId}`, payload, {
        onUploadProgress: options.onUploadProgress,
    });
    options.onResponse?.(response.status);
    return normalizeNote(assertServerNote(response.data, noteId));
}

export async function deleteNote(noteId: number): Promise<{ success: boolean }> {
    const { data } = await api.delete<{ success: boolean }>(`/notes/${noteId}`);
    return data;
}

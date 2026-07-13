/** A note as returned by the Notes API and used throughout the Notes feature. */
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

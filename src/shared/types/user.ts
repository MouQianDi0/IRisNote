/** Shared identity shape returned by authentication and profile APIs. */
export type User = {
    id: number;
    email: string;
    nickname?: string | null;
    avatar?: string | null;
    created_at: string;
};

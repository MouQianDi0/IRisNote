export type UserGender = "male" | "female" | "custom";

/**
 * Shared identity shape returned by authentication and profile APIs.
 * Profile fields are optional so cached users and older servers stay valid.
 */
export type User = {
    id: number;
    email: string;
    nickname?: string | null;
    avatar?: string | null;
    created_at: string | null;
    bio?: string | null;
    gender?: UserGender | null;
    gender_custom?: string | null;
    profile_version?: number;
    profile_updated_at?: string | null;
};

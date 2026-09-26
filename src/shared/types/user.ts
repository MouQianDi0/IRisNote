export type UserGender = "male" | "female";

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
    /** ISO 地区编码（`US` / `US-CA`），与名称快照、字典版本同时有值或同时为空。 */
    region_code?: string | null;
    region_label?: string | null;
    region_version?: string | null;
    profile_version?: number;
    profile_updated_at?: string | null;
};

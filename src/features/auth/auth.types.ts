import type { User } from "@/shared/types/user";

export type VerificationType = "register" | "login";

export type AuthResponse = {
    token: string;
    user: User;
};

export type SendVerificationCodePayload = {
    email: string;
    type: VerificationType;
};

export type SendVerificationCodeResponse = {
    message: string;
};

export type CheckVerificationCodePayload = SendVerificationCodePayload & {
    code: string;
};

export type CheckVerificationCodeResponse = {
    valid: boolean;
};

export type RegisterPayload = {
    email: string;
    password: string;
    nickname?: string;
    code: string;
};

export type LoginPayload = {
    email: string;
    password: string;
    code: string;
};

export type LoginWithCodePayload = {
    email: string;
    code: string;
};

export type AuthState = {
    isLoggedIn: boolean;
    user: User | null;
    token: string | null;
    loading: boolean;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
    syncProfile: () => Promise<void>;
};

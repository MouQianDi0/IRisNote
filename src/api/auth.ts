import api from "@/api/client";

export type VerificationType = "register" | "login";

export type AuthUser = {
    id: number;
    email: string;
    nickname?: string | null;
    avatar?: string | null;
    created_at: string;
};

export type AuthResponse = {
    token: string;
    user: AuthUser;
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

export async function sendVerificationCode(
    payload: SendVerificationCodePayload,
): Promise<SendVerificationCodeResponse> {
    const { data } = await api.post<SendVerificationCodeResponse>(
        "/verify/send",
        payload,
    );
    return data;
}

export async function checkVerificationCode(
    payload: CheckVerificationCodePayload,
): Promise<CheckVerificationCodeResponse> {
    const { data } = await api.post<CheckVerificationCodeResponse>(
        "/verify/check",
        payload,
    );
    return data;
}

export async function register(payload: RegisterPayload): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>("/auth/register", payload);
    return data;
}

export async function loginWithPassword(
    payload: LoginPayload,
): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>("/auth/login", payload);
    return data;
}

export async function loginWithCode(
    payload: LoginWithCodePayload,
): Promise<AuthResponse> {
    const { data } = await api.post<AuthResponse>("/auth/login-code", payload);
    return data;
}
